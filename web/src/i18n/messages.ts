import type { Locale } from './config'

// Single source of truth for every UI string on the site, in English and
// Portuguese. To add a language: add its code to `locales` in ./config and add a
// matching block below — TypeScript will flag any missing key.
//
// Only chrome and static UI copy live here. Bibliographic content (publication
// titles, abstracts, author names) comes from OpenAlex and is not translated.

const en = {
  nav: {
    research: 'Research',
    map: 'Map',
    publications: 'Publications',
    people: 'People',
    opportunities: 'Opportunities',
    news: 'News',
    search: 'Search',
  },
  footer: {
    openThesis: 'Open thesis topics',
    signIn: 'Member sign in',
  },
  home: {
    lede:
      'We study how machines learn from data — and we make what we learn easy to find. Every publication on this site is indexed, semantically searchable, and summarised in plain language.',
    statPublications: 'publications',
    statPeople: 'people',
    statActiveSince: 'active since',
    statOpenTopics: 'open thesis topics',
    themesHead: 'Research themes',
    allThemes: 'All themes →',
    recentHead: 'Recent publications',
    all: 'All',
    newsHead: 'News',
    allNews: 'All news →',
    joinHead: 'Join us',
    joinLede:
      'Looking for an MSc or PhD topic in machine learning? We keep an updated list of open topics and research challenges.',
    browseTopics: 'Browse open topics',
  },
  publications: {
    title: 'Publications',
    semanticSearch: 'Semantic search →',
    add: '+ Add publication',
    addTitle:
      'Members: add a publication via the admin panel; the summary is generated automatically',
    metaSuffix:
      'indexed from OpenAlex · summaries generated automatically and editable by the group',
    allYears: 'all years',
    empty: 'No publications match this filter yet.',
  },
  people: {
    title: 'People',
    metaBefore: 'Members edit their own profiles — ',
    signIn: 'sign in',
    metaAfter: ' to update yours.',
    roleFaculty: 'Faculty',
    roleResearchers: 'Researchers',
    rolePhd: 'PhD Students',
    roleMsc: 'MSc Students',
    roleAlumni: 'Alumni',
    website: 'Website',
    email: 'Email',
    empty: 'No members yet — add them in the admin panel.',
  },
  opportunities: {
    title: 'Opportunities',
    metaBefore:
      'Open MSc and PhD thesis topics supervised by the group. Interested? Contact the advisor listed on the topic — or reach out via ',
    anyFaculty: 'any faculty member',
    metaAfter: ' if you have your own idea.',
    openHead: 'Open topics',
    emptyOpen:
      'No open topics right now — new topics are usually published before each semester. Speculative applications are welcome anytime.',
    advisor: 'Advisor:',
    assignedHead: 'Recently assigned',
  },
  research: {
    title: 'Research',
    meta: 'The thematic lines we work on, and who drives them.',
    emptyBefore: 'Research themes are being written up — meanwhile, browse the ',
    emptyLink: 'publications',
    emptyAfter: '.',
    people: 'People:',
    keyPublications: 'Key publications',
  },
  projects: {
    title: 'Projects',
    meta: 'National, international and industry research projects.',
    empty: 'Project pages are on their way — check back soon.',
    funding: 'Funding:',
  },
  software: {
    title: 'Software & Datasets',
    meta: 'Tools and datasets released by the group.',
    empty: 'Releases are being catalogued — check back soon.',
  },
  news: {
    title: 'News',
    empty: 'No news yet — stay tuned.',
  },
  map: {
    title: 'Research map',
    emptyBefore: 'The topic map has not been computed yet — run the clustering pipeline (',
    emptyAfter: ') after ingesting publications.',
    meta:
      'Every dot is a publication, placed by the meaning of its text (UMAP projection of embeddings). Colours are topic clusters found automatically; grey dots don’t belong to a stable cluster. Hover a dot for the title, click to open.',
    cluster: 'cluster',
    svgAria: 'Scatter map of publications grouped by topic',
  },
  search: {
    title: 'Semantic search',
    meta: 'Describe a topic in your own words — results are ranked by meaning, not keywords.',
    placeholder: 'e.g. deep learning for medical imaging',
    button: 'Search',
    ariaQuery: 'Search query',
    unavailableBefore: 'Search is temporarily unavailable (',
    unavailableAfter: '). Please try again shortly.',
    noMatchesBefore: 'No matches for “',
    noMatchesAfter: '”. Try rephrasing the topic.',
    match: 'match',
    examples: [
      'detecting anomalies in medical images',
      'how do transformers handle long documents',
      'privacy-preserving machine learning',
    ],
  },
  pub: {
    citations: 'citations',
    summary: 'Summary',
    aiEdited: 'AI · human-edited',
    aiGenerated: 'AI-generated',
    abstract: 'Abstract',
    referencesWithin: 'References within the group',
    citedBy: 'Cited by (group publications)',
    emptyBefore: 'No summary or abstract available for this publication yet. See the ',
    originalPublication: 'original publication',
    originalVenue: 'original venue',
    emptyAfter: ' for details.',
    back: '← All publications',
    // AI summary section labels (keyed by aiSummary field name)
    sectionTldr: 'TL;DR',
    sectionProblem: 'Problem',
    sectionMethod: 'Method',
    sectionResults: 'Results',
    sectionTakeaways: 'Takeaways',
    sectionIndustry: 'For industry',
    sectionImpact: 'Why it matters',
  },
  newsItem: {
    shareLinkedIn: 'Share on LinkedIn',
    shareX: 'Share on X',
    related: 'Related publications',
    back: '← All news',
  },
  pubRow: {
    summary: 'summary',
  },
  chat: {
    open: 'Ask about our research',
    title: 'Research assistant',
    intro: 'Ask me anything about the group’s publications — I answer with references.',
    placeholder: 'e.g. What have you published on medical imaging?',
    send: 'Send',
    thinking: 'Thinking…',
    error: 'Something went wrong — please try again.',
    rateLimited: 'Too many messages — please wait a minute.',
    sources: 'Sources',
    aiNote: 'AI-generated answers, may contain mistakes',
    close: 'Close chat',
  },
}

export type Dictionary = typeof en

const pt: Dictionary = {
  nav: {
    research: 'Investigação',
    map: 'Mapa',
    publications: 'Publicações',
    people: 'Pessoas',
    opportunities: 'Oportunidades',
    news: 'Notícias',
    search: 'Pesquisa',
  },
  footer: {
    openThesis: 'Temas de tese em aberto',
    signIn: 'Entrar (membros)',
  },
  home: {
    lede:
      'Estudamos como as máquinas aprendem a partir de dados — e tornamos o que aprendemos fácil de encontrar. Todas as publicações deste site estão indexadas, pesquisáveis por significado e resumidas em linguagem simples.',
    statPublications: 'publicações',
    statPeople: 'pessoas',
    statActiveSince: 'ativos desde',
    statOpenTopics: 'temas de tese em aberto',
    themesHead: 'Linhas de investigação',
    allThemes: 'Todas as linhas →',
    recentHead: 'Publicações recentes',
    all: 'Todas',
    newsHead: 'Notícias',
    allNews: 'Todas as notícias →',
    joinHead: 'Junte-se a nós',
    joinLede:
      'À procura de um tema de mestrado ou doutoramento em aprendizagem automática? Mantemos uma lista atualizada de temas em aberto e desafios de investigação.',
    browseTopics: 'Ver temas em aberto',
  },
  publications: {
    title: 'Publicações',
    semanticSearch: 'Pesquisa semântica →',
    add: '+ Adicionar publicação',
    addTitle:
      'Membros: adicionem uma publicação através do painel de administração; o resumo é gerado automaticamente',
    metaSuffix:
      'indexadas do OpenAlex · resumos gerados automaticamente e editáveis pelo grupo',
    allYears: 'todos os anos',
    empty: 'Ainda não há publicações para este filtro.',
  },
  people: {
    title: 'Pessoas',
    metaBefore: 'Os membros editam os seus próprios perfis — ',
    signIn: 'entre',
    metaAfter: ' para atualizar o seu.',
    roleFaculty: 'Docentes',
    roleResearchers: 'Investigadores',
    rolePhd: 'Doutorandos',
    roleMsc: 'Mestrandos',
    roleAlumni: 'Antigos membros',
    website: 'Site',
    email: 'Email',
    empty: 'Ainda não há membros — adicione-os no painel de administração.',
  },
  opportunities: {
    title: 'Oportunidades',
    metaBefore:
      'Temas de tese de mestrado e doutoramento em aberto, orientados pelo grupo. Interessado? Contacte o orientador indicado no tema — ou fale com ',
    anyFaculty: 'qualquer docente',
    metaAfter: ' se tiver a sua própria ideia.',
    openHead: 'Temas em aberto',
    emptyOpen:
      'Sem temas em aberto neste momento — normalmente publicam-se novos temas antes de cada semestre. Candidaturas espontâneas são bem-vindas a qualquer altura.',
    advisor: 'Orientador:',
    assignedHead: 'Atribuídos recentemente',
  },
  research: {
    title: 'Investigação',
    meta: 'As linhas temáticas em que trabalhamos, e quem as impulsiona.',
    emptyBefore: 'As linhas de investigação estão a ser redigidas — entretanto, consulte as ',
    emptyLink: 'publicações',
    emptyAfter: '.',
    people: 'Pessoas:',
    keyPublications: 'Publicações principais',
  },
  projects: {
    title: 'Projetos',
    meta: 'Projetos de investigação nacionais, internacionais e com a indústria.',
    empty: 'As páginas de projetos estão a caminho — volte em breve.',
    funding: 'Financiamento:',
  },
  software: {
    title: 'Software e Conjuntos de dados',
    meta: 'Ferramentas e conjuntos de dados publicados pelo grupo.',
    empty: 'Os lançamentos estão a ser catalogados — volte em breve.',
  },
  news: {
    title: 'Notícias',
    empty: 'Ainda não há notícias — fique atento.',
  },
  map: {
    title: 'Mapa de investigação',
    emptyBefore:
      'O mapa de temas ainda não foi calculado — execute a pipeline de clustering (',
    emptyAfter: ') depois de importar as publicações.',
    meta:
      'Cada ponto é uma publicação, posicionada pelo significado do seu texto (projeção UMAP de embeddings). As cores são grupos temáticos encontrados automaticamente; os pontos cinzentos não pertencem a um grupo estável. Passe o rato sobre um ponto para ver o título, clique para abrir.',
    cluster: 'grupo',
    svgAria: 'Mapa de dispersão de publicações agrupadas por tema',
  },
  search: {
    title: 'Pesquisa semântica',
    meta: 'Descreva um tema por palavras suas — os resultados são ordenados por significado, não por palavras-chave.',
    placeholder: 'ex.: aprendizagem profunda para imagiologia médica',
    button: 'Pesquisar',
    ariaQuery: 'Consulta de pesquisa',
    unavailableBefore: 'A pesquisa está temporariamente indisponível (',
    unavailableAfter: '). Tente novamente dentro de momentos.',
    noMatchesBefore: 'Sem resultados para “',
    noMatchesAfter: '”. Tente reformular o tema.',
    match: 'correspondência',
    examples: [
      'detetar anomalias em imagens médicas',
      'como lidam os transformers com documentos longos',
      'aprendizagem automática com preservação de privacidade',
    ],
  },
  pub: {
    citations: 'citações',
    summary: 'Resumo',
    aiEdited: 'IA · editado por humano',
    aiGenerated: 'Gerado por IA',
    abstract: 'Resumo (abstract)',
    referencesWithin: 'Referências dentro do grupo',
    citedBy: 'Citado por (publicações do grupo)',
    emptyBefore: 'Ainda não há resumo nem abstract para esta publicação. Consulte a ',
    originalPublication: 'publicação original',
    originalVenue: 'fonte original',
    emptyAfter: ' para mais detalhes.',
    back: '← Todas as publicações',
    sectionTldr: 'TL;DR',
    sectionProblem: 'Problema',
    sectionMethod: 'Método',
    sectionResults: 'Resultados',
    sectionTakeaways: 'Conclusões',
    sectionIndustry: 'Para a indústria',
    sectionImpact: 'Porque importa',
  },
  newsItem: {
    shareLinkedIn: 'Partilhar no LinkedIn',
    shareX: 'Partilhar no X',
    related: 'Publicações relacionadas',
    back: '← Todas as notícias',
  },
  pubRow: {
    summary: 'resumo',
  },
  chat: {
    open: 'Pergunte sobre a nossa investigação',
    title: 'Assistente de investigação',
    intro: 'Pergunte o que quiser sobre as publicações do grupo — respondo com referências.',
    placeholder: 'ex.: O que publicaram sobre imagem médica?',
    send: 'Enviar',
    thinking: 'A pensar…',
    error: 'Algo correu mal — tente novamente.',
    rateLimited: 'Demasiadas mensagens — aguarde um minuto.',
    sources: 'Fontes',
    aiNote: 'Respostas geradas por IA, podem conter erros',
    close: 'Fechar chat',
  },
}

export const messages: Record<Locale, Dictionary> = { en, pt }
