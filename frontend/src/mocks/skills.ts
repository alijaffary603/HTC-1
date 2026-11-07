import type { SkillsResult } from '../types'

// MOCK stand-in for the computer scientist’s extract_skills(text).
// Ignores the file contents and returns a fixed example (an accountant).
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
      { code: '11100', title: 'Financial auditors and accountants', confidence: 0.88 },
      { code: '12200', title: 'Accounting technicians and bookkeepers', confidence: 0.64 },
      { code: '11101', title: 'Financial and investment analysts', confidence: 0.52 },
    ],
  }
}
