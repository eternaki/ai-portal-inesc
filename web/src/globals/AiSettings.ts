import type { GlobalConfig } from 'payload'

import { adminOnly, anyone } from '../access'

// Runtime LLM switching from the admin panel (brief requirement: "swap LLMs =
// config change" — this makes it a dropdown, no redeploy). The AI service reads
// this global via REST and falls back to the LLM_MODEL env var when unset.
export const AiSettings: GlobalConfig = {
  slug: 'ai-settings',
  label: 'AI Settings',
  access: {
    // The model id is not a secret; the AI service reads it without a session
    read: anyone,
    update: adminOnly,
  },
  fields: [
    {
      name: 'llmModel',
      label: 'LLM model',
      type: 'select',
      defaultValue: '',
      // Only providers the AI service can actually authenticate. Groq, Mistral
      // and Cerebras were listed here for months with no GROQ_API_KEY,
      // MISTRAL_API_KEY or CEREBRAS_API_KEY anywhere in the service config or
      // .env.example — picking one sent every AI feature to its offline layer
      // with nothing on screen to say why. Adding a provider means adding its
      // key to ai/app/config.py and .env.example first, then an option here.
      options: [
        { label: 'Server default (LLM_MODEL env)', value: '' },
        { label: 'Gemini · Flash Lite (high quota, the usual choice)', value: 'gemini/gemini-flash-lite-latest' },
        { label: 'Gemini · Flash (better quality, ~20 req/day on the free tier)', value: 'gemini/gemini-flash-latest' },
        { label: 'OpenRouter · Gemma 4 26B (free tier, the fallback provider)', value: 'openrouter/google/gemma-4-26b-a4b-it:free' },
      ],
      admin: {
        description:
          'Model used by all AI features (summaries, chat, snippets). It applies to the provider it names; the others in LLM_FALLBACK_PROVIDERS stay available as backup. The provider API key must be set in the AI service .env.',
      },
    },
    {
      name: 'customModel',
      label: 'Custom model override',
      type: 'text',
      admin: {
        description:
          'Optional. Any LiteLLM model id (provider/model), used instead of the dropdown. A provider this service does not implement is passed to LiteLLM on its own, without the fallback chain.',
      },
    },
    {
      // Feature flags: turn AI features off without a redeploy. Read by the web
      // app (chat widget) and the AI service (chat/search/summary endpoints).
      name: 'features',
      type: 'group',
      label: 'Feature flags',
      admin: { description: 'Enable or disable AI features site-wide.' },
      fields: [
        {
          name: 'enableChatbot',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Show the RAG chatbot on public pages.' },
        },
        {
          name: 'enableSemanticSearch',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Use embeddings in search. Off = keyword search only.' },
        },
        {
          name: 'enableSummaries',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Auto-generate AI summaries when a publication is saved.' },
        },
      ],
    },
  ],
}
