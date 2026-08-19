/**
 * Project descriptions and where each one came from.
 *
 * Data, not logic, kept apart from the importer so it can be checked without
 * booting Payload — the importer runs on import, so a test cannot load it.
 *
 * Every entry is written from that project's own public record and `source` names
 * it. Nothing here is inferred from the acronym: with no description a project's
 * whole searchable text is three or four characters, and the fix for that is a
 * real record, not a plausible sentence. Where a registry gives only a title, the
 * entry says only what the title says.
 *
 * Beware two different PRECISEs: this is the FCT grant that ran 2016-2019, not the
 * pan-European cancer-vulnerability initiative INESC-ID joined in 2026.
 */

export const DESCRIPTIONS = [
  {
    title: 'OLISSIPO',
    source: 'https://cordis.europa.eu/project/id/951970',
    text:
      'OLISSIPO — Fostering Computational Biology Research and Innovation in Lisbon. ' +
      'A Horizon 2020 Twinning action coordinated by INESC-ID with EMBL Heidelberg, ' +
      'INRIA Lyon and ETH Zurich, aimed at building a critical mass at the interface ' +
      'of computer science and health research. Work was organised around single-cell ' +
      'data analysis and simulation, mathematical modelling of interactions between ' +
      'cells and communities, phylogenetic inference by Bayesian and combinatorial ' +
      'methods, and translational bioinformatics with data management and software ' +
      'development.',
  },
  {
    title: 'EXCELERATE',
    source: 'https://cordis.europa.eu/project/id/676559',
    text:
      'ELIXIR-EXCELERATE — Fast-track ELIXIR implementation and drive early user ' +
      'exploitation across the life sciences. A Horizon 2020 research-infrastructure ' +
      'project coordinated by EMBL across 53 partners, accelerating the early ' +
      'implementation of ELIXIR, Europe’s distributed infrastructure for biological ' +
      'information. It consolidated data services for academia and industry, built ' +
      'bioinformatics capacity and training across Europe, and put in place the ' +
      'management processes a large distributed infrastructure needs — so that ' +
      'life-science data becomes findable, accessible, interoperable and reusable.',
  },
  {
    title: 'BioData',
    source: 'https://biodata.pt/',
    text:
      'BioData.pt — the Portuguese distributed research infrastructure for life and ' +
      'health data, and the national node of ELIXIR. It brings together life-science ' +
      'research and innovation organisations across Portugal, providing data-management ' +
      'practice, computing facilities, training and consulting, and connecting academic ' +
      'research with the agrofood, forestry, sea and health sectors.',
  },
  {
    title: 'PRELUNA',
    source: 'https://mlkd.idss.inesc-id.pt/preluna-home.html',
    text:
      'PRELUNA — Precise and Efficient Learning using Attention Mechanisms. The project ' +
      'works on attention-based machine learning, with medical imaging as its main ' +
      'application: raising the quality of care where medical specialists are scarce. ' +
      'The same methods carry over to fire surveillance, Earth imaging and ' +
      'environmental monitoring.',
  },
  {
    title: 'ILU',
    source: 'https://www.inesc-id.pt/ilu-a-technology-to-help-improve-urban-mobility/',
    text:
      'ILU — Integrative Learning from Urban Data and Situational Context for City ' +
      'Mobility Optimization. An FCT-funded project (2019-2022) applying machine ' +
      'learning to urban mobility, carried out with the National Civil Engineering ' +
      'Laboratory, the Lisbon municipality and the metropolitan area’s main public ' +
      'carriers. The aim is to align urban mobility plans with the traffic dynamics ' +
      'that actually emerge, rather than the ones planners assumed.',
  },
  {
    title: 'INTAKE',
    source: 'https://www.inesc-id.pt/research-4-covid19-intake/',
    text:
      'INTAKE — INtegrating mobility daTa into spAtial risK modEls. Selected under ' +
      'FCT’s RESEARCH 4 COVID19 call and run through 2020-2021, the project fed ' +
      'mobile location data into existing models of how COVID-19 spreads ' +
      'geographically, to sharpen predictions of where risk was moving next.',
  },
  {
    title: 'NEURONREDUCE',
    source: 'https://www.inesc-id.pt/projects/IE02041/',
    text:
      'NeuronReduce — Algorithms for Model Reduction and Efficient Simulation of ' +
      'Neural Networks. An FCT-funded project hosted at INESC-ID (2018-2022), ' +
      'working on methods that shrink neural network models and make simulating ' +
      'them cheaper.',
  },
  {
    title: 'PRECISE',
    source: 'https://www.inesc-id.pt/projects/II11009/',
    text:
      'PRECISE — Accelerating progress toward the new era of precision medicine. An ' +
      'FCT-funded project hosted at INESC-ID from December 2016 to November 2019. ' +
      'The public funding registry records the title, the funder and the dates; it ' +
      'carries no summary of the work, and neither does the group’s own page.',
  },
  {
    title: 'DeepPathCOVIDx',
    source: 'https://www.inesc-id.pt/artificial-intelligence-for-covid-19-chest-x-ray-diagnosis/',
    text:
      'DeepPathCOVIDx — artificial intelligence for COVID-19 chest X-ray diagnosis. ' +
      'Funded by Agência Nacional de Inovação with GLSMED Learning Health and run ' +
      'through 2020-2021, the project built a tool to support clinicians reading ' +
      'chest X-ray images, developed by researchers from Técnico and INESC-ID ' +
      'together with Hospital da Luz Learning Health.',
  },
]
