import type { CollectionAfterChangeHook } from 'payload'

// После сохранения публикации в админке — попросить AI-сервис сгенерировать
// саммари и эмбеддинг. Fire-and-forget: сайт и админка не должны зависеть от
// доступности AI-сервиса, поэтому ошибки только логируются.
//
// Пропускается, если запрос помечен X-Skip-Autoprocess — так помечены все
// запросы самого AI-сервиса (ingest, запись саммари), чтобы массовый ingest
// не устроил всплеск LLM-вызовов. Батч-пайплайны (summarize/embed) обрабатывают
// массовые загрузки отдельно.
export const autoProcessPublication: CollectionAfterChangeHook = async ({ doc, req }) => {
  const aiUrl = process.env.AI_SERVICE_URL
  const token = process.env.AI_SERVICE_TOKEN
  if (!aiUrl || !token) return doc

  if (req?.headers?.get('x-skip-autoprocess')) return doc

  // Генерим только когда есть что суммировать и саммари ещё нет
  if (!doc?.abstract || doc?.aiSummaryStatus !== 'none') return doc

  // Fire-and-forget: не блокируем сохранение — AI-сервис обработает фоном,
  // саммари появится через несколько секунд. Сайт не зависит от AI-сервиса.
  void fetch(`${aiUrl}/process/publication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: JSON.stringify({ id: doc.id }),
    signal: AbortSignal.timeout(120000),
  }).catch((err) => {
    req?.payload?.logger?.warn(`autoProcessPublication: AI service call failed: ${err}`)
  })

  return doc
}
