import OpenAI from 'openai';


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
        });
        return stream.choices[0]?.message?.content;
    } catch (error) {
        console.error("调用 AI 模型时出错:", error);
        return null;
    }
}
