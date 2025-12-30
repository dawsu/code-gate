import OpenAI from 'openai'
import { BaseLLMProvider, ReviewInput } from '../base.js'

export class DeepSeekProvider extends BaseLLMProvider {
  async review(input: ReviewInput): Promise<string> {
    const opts = this.config.providerOptions?.deepseek
    const baseURL = (opts?.baseURL || 'https://api.deepseek.com').replace(/`/g, '').trim()
    const apiKeyEnv = opts?.apiKeyEnv || 'DEEPSEEK_API_KEY'
    const apiKey = process.env[apiKeyEnv] || opts?.apiKey

    if (!apiKey) {
      throw new Error(`Missing DeepSeek API key. Please set ${apiKeyEnv} in environment variables or configure 'apiKey' in .codegate.js`)
    }

    const client = new OpenAI({ baseURL, apiKey })
    const model = opts?.model || 'deepseek-chat'

    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: input.prompt },
        { role: 'user', content: this.buildUserPrompt(input.diff) }
      ],
      ...opts?.request
    })

    return res.choices?.[0]?.message?.content || ''
  }
}
