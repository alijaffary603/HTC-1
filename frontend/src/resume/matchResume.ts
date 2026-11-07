import type { SkillsResult } from '../types'
import { findOccupation } from '../data/reference'

// Matches résumé text to skills and to the model's job groups (NOC 2021, 4 digits).
// Each skill lists the job groups it points to, with a weight from 1 (weak hint)
// to 3 (strong signal). A job's score is the sum over the skills found, with a
// small bonus when a skill shows up several times.
//
// Stand-in for the computer scientist's extract_skills() until it's connected.
// Keep the same output shape (SkillsResult) so swapping it in changes nothing else.

type Skill = [label: string, pattern: string, codes: string]

const SKILLS: Skill[] = [
  // Software and data
  ['Java', String.raw`\bjava\b(?!\s*script)`, '2123:3 2122:1'],
  ['JavaScript', String.raw`\b(javascript|typescript|node\.?js|express\.?js)\b`, '2123:3'],
  ['React', String.raw`\breact(\.js|js)?\b`, '2123:3'],
  ['Spring Boot', String.raw`\bspring boot\b`, '2123:3'],
  ['Python', String.raw`\bpython\b`, '2123:2 2121:2 2122:1'],
  ['C++ or C#', String.raw`(?<![a-z])(c\+\+|c#)`, '2123:2 2131:1'],
  ['HTML and CSS', String.raw`\b(html5?|css3?)\b`, '2123:2 5212:1'],
  ['SQL and databases', String.raw`\b(sql|mysql|postgres(ql)?|sqlite|mongodb|database design)\b`, '2122:2 2123:1 2121:1'],
  ['REST APIs', String.raw`\b(rest(ful)? apis?|api development|apis?)\b`, '2123:2'],
  ['Software engineering', String.raw`\b(software (engineering|development|developer|engineer)|full[- ]stack|back[- ]?end|front[- ]?end|object[- ]oriented|oop|data structures)\b`, '2123:3'],
  ['Developer or programmer', String.raw`\b(developer|programmer)\b`, '2123:3'],
  ['Testing', String.raw`\b(unit test(s|ing)?|junit|pytest|test automation|qa testing)\b`, '2123:2 2222:1'],
  ['Git', String.raw`\bgit(hub|lab)?\b`, '2123:1'],
  ['Agile', String.raw`\b(agile|scrum|kanban|jira)\b`, '2123:1 2122:1'],
  ['Cloud (AWS, Azure, GCP)', String.raw`\b(aws|amazon web services|azure|google cloud|gcp)\b`, '2122:2 2123:1 2222:1'],
  ['Docker and Kubernetes', String.raw`\b(docker|kubernetes|ci/cd|devops)\b`, '2122:2 2123:1'],
  ['Computer science', String.raw`\bcomputer science\b`, '2123:2 2122:2 2121:1'],
  ['Computer engineering', String.raw`\bcomputer engineering\b`, '2131:3 2123:1'],
  ['Machine learning', String.raw`\b(machine learning|deep learning|tensorflow|pytorch|scikit-learn|ml models?|artificial intelligence|datathon)\b`, '2121:3 2123:1'],
  ['Statistics and data analysis', String.raw`\b(statistics|statistical|data analy(sis|tics|st)|regression|tableau|power bi|econometrics)\b`, '2121:2 4140:1'],
  ['Networking', String.raw`\b(networking|tcp/ip|cisco|ccna|firewalls?|network administration)\b`, '2222:3 2122:1'],
  ['Cybersecurity', String.raw`\b(cyber ?security|information security|penetration testing|siem|security\+)\b`, '2122:3'],
  ['IT support', String.raw`\b(help ?desk|it support|technical support|desktop support|it technician)\b`, '2222:3'],
  ['Linux', String.raw`\b(linux|unix|bash)\b`, '2222:1 2122:1'],
  ['Web development', String.raw`\b(web (development|developer|design)|wordpress|shopify)\b`, '2123:2 5212:1'],
  ['UX and UI design', String.raw`\b(ux|ui design|user experience|figma|wireframes?)\b`, '5212:2 2123:1'],

  // Engineering and science
  ['CAD and drafting', String.raw`\b(autocad|solidworks|revit|cad|drafting)\b`, '2221:2 2230:2 2130:1'],
  ['GIS and surveying', String.raw`\b(gis|arcgis|qgis|surveying|geomatics)\b`, '2221:3'],
  ['Civil or mechanical engineering', String.raw`\b(civil engineering|mechanical engineering|structural (design|engineering))\b`, '2130:3'],
  ['Electrical engineering', String.raw`\b(electrical engineering|circuit design|power systems?|protection and control)\b`, '2131:3 2231:1'],
  ['PLC and SCADA', String.raw`\b(plc|scada|instrumentation|control systems)\b`, '2231:3 7220:1'],
  ['Chemical or process engineering', String.raw`\b(chemical engineering|process engineering)\b`, '2132:3'],
  ['Petroleum and geology', String.raw`\b(petroleum engineering|reservoir|geolog(y|ist)|geophysic\w*)\b`, '2133:2 2110:2'],
  ['Lab work', String.raw`\b(laboratory|lab techniques|titration|chromatography|chemistry)\b`, '2210:2 2111:1 3212:1'],
  ['Environmental science', String.raw`\b(environmental (assessment|monitoring|science|consulting)|reclamation)\b`, '2111:2 2112:1 2210:1'],
  ['Health and safety', String.raw`\b(occupational health and safety|hse (advisor|coordinator|officer)|safety (program|officer|advisor|coordinator)|nebosh|crsp)\b`, '2112:3 2223:1'],
  ['Project management', String.raw`\b(project management|pmp|project manager|project coordinator)\b`, '7001:1 1120:1 2001:1 1001:1'],

  // Business, finance and office
  ['Accounting', String.raw`\b(accounting|accountant|cpa|gaap|ifrs|audit(ing|or)?|tax returns?)\b`, '1110:3 1220:1'],
  ['Bookkeeping', String.raw`\b(bookkeep\w*|quickbooks|sage 50|accounts (payable|receivable)|reconciliation)\b`, '1220:3 1310:1'],
  ['Payroll', String.raw`\bpayroll\b`, '1310:2 1220:1'],
  ['Financial analysis', String.raw`\b(financial (analysis|modell?ing|reporting|statements|planning)|budget(ing|s)?|forecasting|valuation)\b`, '1110:2 1002:1'],
  ['Investments', String.raw`\b(investment|portfolio|cfa|equity research|wealth management)\b`, '1110:2 6310:1'],
  ['Insurance', String.raw`\b(insurance|claims adjust\w*|underwrit\w*)\b`, '1220:2 6310:2'],
  ['Banking', String.raw`\b(bank teller|teller|loans?|mortgages?|personal banking)\b`, '6310:2 1420:2'],
  ['Marketing', String.raw`\b(marketing|seo|social media|branding|digital campaigns?|advertising|google analytics)\b`, '1120:2 5111:1 6001:1'],
  ['Human resources', String.raw`\b(human resources|recruit(ing|ment|er)|onboarding|talent acquisition|hris)\b`, '1120:3'],
  ['Business analysis', String.raw`\b(business analy\w+|consulting|consultant|process improvement|stakeholder)\b`, '1120:2 4140:1'],
  ['Office administration', String.raw`\b(administrative assistant|reception(ist)?|data entry|office (administration|management)|calendar management|filing)\b`, '1311:3 1410:2'],
  ['Logistics and supply chain', String.raw`\b(logistics|supply chain|procurement|purchasing|inventory|shipping and receiving|dispatch(er|ing)?)\b`, '1320:2 1440:2 7510:1'],
  ['Customer service', String.raw`\b(customer service|client service|call cent(er|re)|customer support)\b`, '6440:3 6410:1'],
  ['Sales', String.raw`\b(sales|cold calling|crm|salesforce|b2b|account management)\b`, '6410:1 6001:1 6210:1'],
  ['Retail', String.raw`\b(retail|merchandis\w+|point of sale|cash handling|cashier)\b`, '6410:2 6510:1 6201:1'],
  ['Store management', String.raw`\b(store manager|assistant (store )?manager|department manager)\b`, '6002:5 6201:1'],
  ['Supervising people', String.raw`\b(supervis(e|ed|ing|or)|team lead(er)?|shift lead)\b`, '6201:1 1201:1'],
  ['Real estate', String.raw`\b(real estate|realtor)\b`, '6310:3'],

  // Health
  ['Nursing', String.raw`\b(nurs(e|ing)|registered nurse|lpn|patient care|medication administration)\b`, '3130:3 3310:1'],
  ['Care aide work', String.raw`\b(health care aide|healthcare aide|personal support worker|caregiv\w+|home care)\b`, '3310:2 4410:2'],
  ['First aid and CPR', String.raw`\b(first aid|cpr|bls)\b`, '3210:1 3310:1 4210:1'],
  ['Pharmacy', String.raw`\b(pharmac(y|ist)|dispensing)\b`, '3112:3'],
  ['Therapy and rehab', String.raw`\b(physiotherap\w+|occupational therap\w+|massage therap\w+|kinesiology|rehabilitation)\b`, '3120:2 3210:1'],
  ['Medical lab', String.raw`\b(medical laborator\w+|phlebotom\w+|diagnostic imaging|x-ray)\b`, '3212:3'],
  ['Dental', String.raw`\b(dental|dentist|dental hygien\w+)\b`, '3211:2 3111:1'],
  ['Paramedic', String.raw`\b(paramedic|emt|emergency medical)\b`, '3210:3'],

  // Education, social and legal
  ['Teaching', String.raw`\b(teacher|(?<!discharge |patient |health )teaching|lesson plan\w*|classroom management|curriculum|bachelor of education|b\.ed|student teaching|practicum)\b`, '4122:3 4121:1 4310:1'],
  ['Tutoring', String.raw`\btutor(ing|ed)?\b`, '4310:2 4122:1'],
  ['Early childhood', String.raw`\b(early childhood|daycare|child ?care)\b`, '4220:2 4310:2'],
  ['Educational assistant', String.raw`\b(educational assistant|teacher assistant|teaching assistant)\b`, '4310:3'],
  ['Social work and counselling', String.raw`\b(social work\w*|counsell?ing|case management|mental health|addictions?)\b`, '4130:3 4220:1'],
  ['Career counselling', String.raw`\b(career (counsell?ing|development)|employment services)\b`, '4132:3'],
  ['Legal', String.raw`\b(paralegal|legal research|litigation|law clerk|lawyer|juris doctor)\b`, '4110:2 4220:1 1210:1'],
  ['Research and policy', String.raw`\b(policy (analysis|research)|research assistant|program evaluation|grant writing)\b`, '4140:2 4120:1'],
  ['Public safety', String.raw`\b(police|law enforcement|firefight\w+|corrections)\b`, '4210:3'],
  ['Security', String.raw`\b(security guard|loss prevention|security officer)\b`, '6441:3'],
  ['Coaching and fitness', String.raw`\b(coach(ing)?|personal train\w+|fitness instruct\w+|lifeguard)\b`, '5410:2 5320:1'],

  // Arts and communications
  ['Writing and communications', String.raw`\b(copywrit\w+|content writing|editing|journalis\w+|public relations|technical writing|communications (specialist|coordinator|officer|degree|manager))\b`, '5111:3 1120:1'],
  ['Graphic design', String.raw`\b(graphic design|photoshop|illustrator|indesign|adobe creative)\b`, '5212:3'],
  ['Photo and video', String.raw`\b(photograph\w+|video editing|premiere pro|videograph\w+)\b`, '5311:2 5211:1'],

  // Trades and transport
  ['Electrical trade', String.raw`\b(electrician|electrical (installation|wiring|apprentice)|wiring|conduit|journeyman electrician)\b`, '7220:3 7201:1'],
  ['Power line work', String.raw`\b(power ?line|lineman|lineworker|powerline technician)\b`, '7220:3'],
  ['Welding and fabrication', String.raw`\b(weld(er|ing)|metal fabrication|machinist|ironwork\w*)\b`, '7210:3'],
  ['Plumbing and pipefitting', String.raw`\b(plumb(er|ing)|pipefitt\w+|steamfitt\w+|gas fitt\w+)\b`, '7230:3'],
  ['Carpentry', String.raw`\b(carpent\w+|framing|formwork|cabinet ?mak\w+)\b`, '7231:3'],
  ['Heavy-duty mechanics', String.raw`\b(millwright|heavy[- ]duty mechanic|industrial mechanic|hydraulics?)\b`, '7240:3'],
  ['Automotive', String.raw`\b(automotive|auto mechanic|vehicle repair|oil changes?)\b`, '7241:3'],
  ['HVAC', String.raw`\b(hvac|refrigeration|furnace)\b`, '7240:2 7320:1'],
  ['Construction labour', String.raw`\b(general labou?r(er)?|construction labou?r(er)?|labou?rer)\b`, '7511:3'],
  ['Construction', String.raw`\b(construction site|site superintendent|blueprints?|estimating)\b`, '7001:1 7201:1 2230:1'],
  ['Heavy equipment', String.raw`\b(heavy equipment|excavator|loader operator|bulldozer|grader)\b`, '7340:3'],
  ['Crane operation', String.raw`\bcrane\b`, '7250:3'],
  ['Driving', String.raw`\b(class 1|truck driv\w+|commercial driv\w+|delivery driver|bus driver)\b`, '7330:3 7520:1'],
  ['Warehouse and forklift', String.raw`\b(forklift|material handl\w+|warehouse)\b`, '7510:2'],
  ['Painting, roofing and drywall', String.raw`\b(roofing|drywall|flooring install\w*|(commercial|residential|house) painting)\b`, '7311:3'],
  ['Concrete and tile', String.raw`\b(concrete (finish\w*|forming|work)|tile setting|plastering)\b`, '7310:3'],
  ['Building maintenance', String.raw`\b(building maintenance|janitor\w*|custodian|caretaker)\b`, '7320:2 6531:1'],

  // Energy, resources and manufacturing
  ['Power engineering', String.raw`\b(power engineer\w*|boiler|steam ticket|(3rd|4th) class|plant operator)\b`, '9210:3 9310:1'],
  ['Process operations', String.raw`\b(process operator|control room|dcs)\b`, '9310:3'],
  ['Oil and gas field work', String.raw`\b(oil and gas|oilfield|drilling rig|rig hand|roughneck|wellsite|field operator)\b`, '8410:2 8310:1 8511:1 8202:1'],
  ['Mining', String.raw`\b((?<!data )mining|underground mine|haul truck)\b`, '8310:2 7340:1'],
  ['Farming', String.raw`\b(farm(ing|hand)?|agricultur\w+|livestock|harvest\w*|ranch\w*)\b`, '8412:2 8002:1 8510:1'],
  ['Landscaping', String.raw`\blandscap\w+\b`, '8512:3'],
  ['Manufacturing', String.raw`\b(assembly line|production line|machine operat\w+|manufacturing)\b`, '9420:1 9510:1 9201:1'],

  // Food, hospitality and personal services
  ['Cooking', String.raw`\b(line cook|cook(ing)?|chef|kitchen|food prep\w*|baker|butcher)\b`, '6320:3 6520:1'],
  ['Food and beverage service', String.raw`\b(bartend\w+|barista|waiter|waitress|food server|restaurant server)\b`, '6430:2 6520:1'],
  ['Hospitality', String.raw`\b(hotel|front desk|guest services|hospitality)\b`, '6431:2 6003:1'],
  ['Restaurant management', String.raw`\b(restaurant manager|kitchen manager|food service manag\w+)\b`, '6003:3'],
  ['Hair and esthetics', String.raw`\b(hairstyl\w+|esthetic\w+|barber|cosmetolog\w+)\b`, '6321:3'],
  ['Cleaning', String.raw`\b((?<!data )cleaning|cleaner|housekeep\w+|janitorial)\b`, '6531:3'],
]

const COMPILED = SKILLS.map(([label, pattern, codes]) => ({
  label,
  re: new RegExp(pattern, 'gi'),
  codes: codes.split(' ').map((c) => {
    const [code, w] = c.split(':')
    return { code, weight: Number(w) }
  }),
}))

if (import.meta.env.DEV) {
  for (const s of COMPILED) for (const c of s.codes) if (!findOccupation(c.code)) console.warn(`Unknown job code ${c.code} in skill ${s.label}`)
}

export interface ResumeMatch extends SkillsResult {
  suggestedOccupations: (SkillsResult['suggestedOccupations'][number] & { because: string[] })[]
}

export function matchResume(text: string): ResumeMatch {
  const found: { label: string; count: number }[] = []
  const scores = new Map<string, { score: number; because: { label: string; points: number }[] }>()

  for (const s of COMPILED) {
    const count = text.match(s.re)?.length ?? 0
    if (!count) continue
    found.push({ label: s.label, count })
    const boost = 1 + 0.25 * Math.min(count - 1, 4)
    for (const { code, weight } of s.codes) {
      const entry = scores.get(code) ?? { score: 0, because: [] }
      entry.score += weight * boost
      entry.because.push({ label: s.label, points: weight * boost })
      scores.set(code, entry)
    }
  }

  const ranked = [...scores.entries()]
    .filter(([code]) => findOccupation(code))
    .sort((a, b) => b[1].score - a[1].score)
  const top = ranked[0]?.[1].score ?? 0
  const suggestions = ranked
    .filter(([, v], i) => v.score >= Math.max(3, top * (i < 3 ? 0.15 : 0.35)))
    .slice(0, 4)
    .map(([code, v]) => ({
      code,
      title: findOccupation(code)!.title,
      confidence: Math.round(Math.min(0.95, v.score / (v.score + 6)) * 100) / 100,
      because: v.because.sort((a, b) => b.points - a.points).slice(0, 4).map((b) => b.label),
    }))

  return {
    skills: found
      .sort((a, b) => b.count - a.count)
      .slice(0, 16)
      .map((f) => ({ name: f.label, confidence: Math.min(1, 0.5 + 0.1 * f.count) })),
    suggestedOccupations: suggestions,
  }
}
