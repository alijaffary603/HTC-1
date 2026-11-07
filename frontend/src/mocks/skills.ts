import type { SkillsResult } from '../types'

// MOCK stand-in for the computer scientist’s extract_skills(text).
// Ignores the file contents and returns a fixed example (an accountant).
// Codes are NOC 2021 4-digit groups, the same ones gridskills.api.score() takes.
export function mockExtractSkills(_fileName: string): SkillsResult {
  return {
    skills: [
      { name: 'Financial reporting', confidence: 0.95 },
      { name: 'Excel', confidence: 0.92 },
      { name: 'Budgeting', confidence: 0.85 },
      { name: 'Audit', confidence: 0.8 },
      { name: 'Team leadership', confidence: 0.6 },
    ],
    suggestedOccupations: [
      { code: '1110', title: 'Auditors, accountants and investment professionals', confidence: 0.88 },
      { code: '1220', title: 'Accounting, insurance and related business administrative occupations', confidence: 0.64 },
      { code: '1002', title: 'Managers in financial and business services', confidence: 0.52 },
    ],
  }
}
