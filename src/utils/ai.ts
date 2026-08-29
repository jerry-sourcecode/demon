import OpenAI from 'openai';
import { useEmitter } from "@/store/emit";

export interface AiConfigLike {
    service: "deepseek" | "siliconflow";
    apiKey: string;
    model: string;
}

export async function callAi(service: "deepseek" | "siliconflow", apiKey: string, model: string, premise: string, question: string) {
    try {
        let baseURL = "";
        if (service === "deepseek") {
            baseURL = "https://api.deepseek.com"; // DeepSeek 的 API 地址
        } else if (service === "siliconflow") {
            baseURL = "https://api.siliconflow.cn/v1"; // SiliconFlow 的 API 地址
        }
        const client = new OpenAI({
            apiKey: apiKey,
            baseURL,
            dangerouslyAllowBrowser: true, // 如果在浏览器环境中使用，需要设置这个选项
        });
        const stream = await client.chat.completions.create({
            model: model,
            messages: [
                { role: "system", content: `你是一个 AI 助手，请根据以下前提信息提供详细的解答：${premise}` },
                { role: "user", content: question }
            ],
            temperature: 0.7,
            max_tokens: 1024,
            // DeepSeek/兼容接口的扩展字段：关闭思考模式
            extra_body: { thinking: { type: "disabled" } },
        } as any);
        return stream.choices[0]?.message?.content;
    } catch (error) {
        console.error("调用 AI 模型时出错:", error);
        return null;
    }
}

/**
 * 调用 AI 并显示全局 loading 覆盖层（渔夫/郎中共用）。
 * 通过 try/finally 保证无论成功或出错都会关闭 loading。
 */
export async function callAiWithLoading(
    aiConfig: AiConfigLike,
    premise: string,
    question: string,
): Promise<string | null | undefined> {
    const emitter = useEmitter();
    emitter.emit('ai-loading', true);
    try {
        return await callAi(aiConfig.service, aiConfig.apiKey, aiConfig.model, premise, question);
    } finally {
        emitter.emit('ai-loading', false);
    }
}

/**
 * AI 测试专用：发送问题并返回内容与错误信息。
 * 与 callAi 不同，这里把错误原因透出，便于界面提示用户检查密钥/模型。
 */
export async function callAiForTest(
    service: "deepseek" | "siliconflow",
    apiKey: string,
    model: string,
    question: string,
): Promise<{ content: string | null; error: string | null }> {
    try {
        const baseURL = service === "deepseek"
            ? "https://api.deepseek.com"
            : "https://api.siliconflow.cn/v1";
        const client = new OpenAI({
            apiKey,
            baseURL,
            dangerouslyAllowBrowser: true,
        });
        const stream = await client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: "你是一个严格遵循指令的 AI 助手，请严格按照要求只输出指定格式的 JSON 对象。" },
                { role: "user", content: question },
            ],
            temperature: 0,
            max_tokens: 1024,
            // DeepSeek/兼容接口的扩展字段：关闭思考模式
            extra_body: { thinking: { type: "disabled" } },
        } as any);
        return { content: stream.choices[0]?.message?.content ?? null, error: null };
    } catch (error) {
        console.error("调用 AI 模型时出错:", error);
        return { content: null, error: error instanceof Error ? error.message : String(error) };
    }
}
