import type { Occupation, Region, Town } from '../types'

// Reference lists. MOCK / DRAFT: the final ~50 occupations and the region scheme
// are picked in Phase 0 with the data scientist. NOC 2021 codes and the
// town -> region mapping below should be checked against StatCan before launch.

export type Sector =
  | 'power_trades'
  | 'construction'
  | 'tech'
  | 'finance'
  | 'education'
  | 'retail'
  | 'health'
  | 'admin'

export const OCCUPATIONS: (Occupation & { sector: Sector })[] = [
  { code: '11100', title: 'Financial auditors and accountants', sector: 'finance' },
  { code: '11101', title: 'Financial and investment analysts', sector: 'finance' },
  { code: '12200', title: 'Accounting technicians and bookkeepers', sector: 'finance' },
  { code: '11200', title: 'Human resources professionals', sector: 'admin' },
  { code: '13110', title: 'Administrative assistants', sector: 'admin' },
  { code: '13201', title: 'Production and transportation logistics coordinators', sector: 'admin' },
  { code: '60020', title: 'Retail and wholesale trade managers', sector: 'retail' },
  { code: '64100', title: 'Retail salespersons and visual merchandisers', sector: 'retail' },
  { code: '41220', title: 'Secondary school teachers', sector: 'education' },
  { code: '41221', title: 'Elementary school and kindergarten teachers', sector: 'education' },
  { code: '41210', title: 'College and other vocational instructors', sector: 'education' },
  { code: '31301', title: 'Registered nurses and registered psychiatric nurses', sector: 'health' },
  { code: '21211', title: 'Data scientists', sector: 'tech' },
  { code: '21232', title: 'Software developers and programmers', sector: 'tech' },
  { code: '21223', title: 'Database analysts and data administrators', sector: 'tech' },
  { code: '22220', title: 'Computer network and web technicians', sector: 'tech' },
  { code: '21300', title: 'Civil engineers', sector: 'construction' },
  { code: '21310', title: 'Electrical and electronics engineers', sector: 'power_trades' },
  { code: '22310', title: 'Electrical and electronics engineering technologists and technicians', sector: 'power_trades' },
  { code: '22303', title: 'Construction estimators', sector: 'construction' },
  { code: '70010', title: 'Construction managers', sector: 'construction' },
  { code: '70012', title: 'Facility operation and maintenance managers', sector: 'construction' },
  { code: '72200', title: 'Electricians (except industrial and power system)', sector: 'power_trades' },
  { code: '72201', title: 'Industrial electricians', sector: 'power_trades' },
  { code: '72202', title: 'Power system electricians', sector: 'power_trades' },
  { code: '72106', title: 'Welders and related machine operators', sector: 'construction' },
  { code: '72300', title: 'Plumbers', sector: 'construction' },
  { code: '72310', title: 'Carpenters', sector: 'construction' },
  { code: '72400', title: 'Construction millwrights and industrial mechanics', sector: 'power_trades' },
  { code: '73400', title: 'Heavy equipment operators', sector: 'construction' },
  { code: '92100', title: 'Power engineers and power systems operators', sector: 'power_trades' },
]

// Alberta economic regions (StatCan). Output is regional, not per town.
export const REGIONS: Region[] = [
  { id: '4810', name: 'Lethbridge–Medicine Hat' },
  { id: '4820', name: 'Camrose–Drumheller' },
  { id: '4830', name: 'Calgary' },
  { id: '4840', name: 'Banff–Jasper–Rocky Mountain House' },
  { id: '4850', name: 'Red Deer' },
  { id: '4860', name: 'Edmonton' },
  { id: '4870', name: 'Athabasca–Grande Prairie–Peace River' },
  { id: '4880', name: 'Wood Buffalo–Cold Lake' },
]

const t = (regionId: string, ...names: string[]): Town[] => names.map((name) => ({ name, regionId }))

export const TOWNS: Town[] = [
  ...t('4810', 'Lethbridge', 'Medicine Hat', 'Brooks', 'Taber', 'Pincher Creek'),
  ...t('4820', 'Camrose', 'Drumheller', 'Stettler', 'Wainwright'),
  ...t('4830', 'Calgary', 'Airdrie', 'Cochrane', 'Okotoks', 'Chestermere', 'High River', 'Strathmore'),
  ...t('4840', 'Canmore', 'Banff', 'Jasper', 'Rocky Mountain House', 'Hinton', 'Edson'),
  ...t('4850', 'Red Deer', 'Sylvan Lake', 'Lacombe', 'Innisfail', 'Olds'),
  ...t('4860', 'Edmonton', 'St. Albert', 'Sherwood Park', 'Spruce Grove', 'Leduc', 'Fort Saskatchewan', 'Stony Plain'),
  ...t('4870', 'Grande Prairie', 'Peace River', 'Athabasca', 'Slave Lake', 'Whitecourt'),
  ...t('4880', 'Fort McMurray', 'Cold Lake', 'Lac La Biche', 'Bonnyville', 'St. Paul'),
].sort((a, b) => a.name.localeCompare(b.name))

export const findOccupation = (code: string) => OCCUPATIONS.find((o) => o.code === code)
export const findRegion = (id: string) => REGIONS.find((r) => r.id === id)
export const findTown = (name: string) => TOWNS.find((t) => t.name === name)
