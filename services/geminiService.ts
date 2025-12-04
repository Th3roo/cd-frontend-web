import { GoogleGenAI, Schema, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

// Initialize client safely
try {
  if (process.env.API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  } else {
    console.warn("Gemini API Key is missing. Narrative features will be disabled.");
  }
} catch (error) {
  console.error("Failed to initialize Gemini Client", error);
}

// Helper to clean Markdown code blocks from JSON response
const cleanJson = (text: string): string => {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const generateNarrative = async (
  context: string, 
  recentLogs: string[]
): Promise<string | null> => {
  if (!aiClient) return null;

  try {
    const model = 'gemini-2.5-flash';

    const prompt = `
    Ты — Мастер Подземелий (Dungeon Master) в текстовой ролевой игре.
    Текущий контекст действия: ${context}
    
    Журнал последних событий:
    ${recentLogs.join('\n')}
    
    Задача: Сгенерируй короткое, атмосферное описание или реакцию на последние события на РУССКОМ языке. 
    Будь краток (до 20 слов), мрачен и иммерсивен. Не описывай игровые механики (цифры урона, HP), описывай ощущения, звуки, запахи или визуал.
    `;

    const response = await aiClient.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        maxOutputTokens: 60,
        temperature: 0.8,
      }
    });

    return response.text ? response.text.trim() : null;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};

export const parseUserIntent = async (
    input: string,
    visibleContext: string
): Promise<{ command?: string; narrative?: string } | null> => {
    if (!aiClient) return null;

    try {
        const prompt = `
        Ты — интерпретатор команд для текстовой RPG.
        
        ДОСТУПНЫЕ ИГРОВЫЕ КОМАНДЫ (СТРОГИЙ СИНТАКСИС):
        - move [north/south/east/west]
        - attack [LABEL]
        - get
        - use [item_name]
        - wait
        - look
        - descend
        - inventory
        
        КОНТЕКСТ:
        ${visibleContext}
        
        ВВОД ИГРОКА: "${input}"
        
        Если это действие -> верни JSON {"command": "..."}.
        Если это болтовня/вопрос -> верни JSON {"narrative": "..."}.
        `;

        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        command: { type: Type.STRING },
                        narrative: { type: Type.STRING }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) return null;
        return JSON.parse(cleanJson(text));

    } catch (e) {
        console.error("Intent parsing failed:", e);
        return null;
    }
}

export const evaluateSocialInteraction = async (
    playerText: string,
    npc: any, 
    context: string
): Promise<{ success: boolean; newState?: string; reaction: string } | null> => {
    if (!aiClient) return null;

    try {
        const prompt = `
        Ты — Game Master. Игрок говорит с NPC.
        
        NPC: ${npc.name}, Характер: ${npc.personality || "Обычный"}, Состояние: ${npc.aiState}
        Контекст: ${context}
        Игрок говорит: "${playerText}"
        
        Задача:
        1. Оцени успех (success). Запугать труса легко. Уговорить врага сложно.
        2. Если успех, выбери newState (IDLE, FLEEING). Если нет - null.
        3. Напиши reaction (ответ NPC, до 10 слов).
        
        Верни JSON.
        `;

        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        success: { type: Type.BOOLEAN },
                        newState: { type: Type.STRING },
                        reaction: { type: Type.STRING }
                    }
                }
            }
        });

        const text = response.text;
        console.log("AI Response Raw:", text); // DEBUG LOG

        if (!text) return null;
        return JSON.parse(cleanJson(text));

    } catch (e) {
        console.error("Social check failed", e);
        return null;
    }
};