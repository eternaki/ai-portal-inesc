// Публичный адрес сайта: на проде задаётся через SITE_URL (см. .env.example)
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

export const SITE_NAME = 'MLKD — Machine Learning and Knowledge Discovery @ INESC-ID'
