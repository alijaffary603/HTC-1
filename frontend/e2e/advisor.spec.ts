import { test, expect } from '@playwright/test'

const plan = {
  summary: 'Explore this transition before committing to training.',
  transferableSkills: ['Scheduling'],
  skillGaps: [{ skill: 'Entry requirements', reason: 'Confirm the required credentials', resourceIds: ['alis-careers'] }],
  steps: [{ title: 'Check entry requirements', detail: 'Review the occupation profile.', week: 1, resourceIds: ['alis-careers'] }],
  outreachDraft: 'Could I ask about your career transition?', questions: ['What experience do you have?'],
  resourceIds: ['alis-careers'], mentorIds: [], mentors: [],
  resources: [{ id: 'alis-careers', title: 'Explore occupations and requirements', provider: 'Alberta alis', url: 'https://alis.alberta.ca/', kind: 'requirements', description: 'Check role requirements.', checkedOn: '2026-11-07' }],
  current: { code: '1110', title: 'Auditors, accountants and investment professionals' },
  target: { code: '7220', title: 'Electrical trades' }, region: 'Calgary',
  limitations: ['Energy-demand scenarios are not hiring forecasts.'],
}

test('real model results, consent, follow-up and saved progress survive reload', async ({ page }) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/advisor', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ json: plan })
  })
  await page.goto('/results?occupation=1110&region=Calgary')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(plan.current.title)
  await expect(page.getByRole('heading', { name: 'Job trend' })).toBeVisible()
  const build = page.getByRole('button', { name: 'Build my action plan' })
  await expect(build).toBeDisabled()
  await page.getByRole('checkbox', { name: /Send my skills/ }).check()
  await build.click()
  await expect(page.getByText(plan.summary)).toBeVisible()
  await expect(page.getByText(/No opted-in mentor matches yet/)).toBeVisible()
  expect(requests[0].occupation).toBe('1110')
  expect(requests[0].region).toBe('Calgary')
  await page.getByLabel('Ask a follow-up question').fill('Can I study in the evenings?')
  await page.getByRole('button', { name: 'Ask and update plan' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect((requests[1].history as unknown[]).length).toBe(2)
  await page.getByRole('button', { name: 'Save plan and track progress' }).click()
  await page.getByRole('link', { name: 'Plans', exact: true }).click()
  await expect(page.getByText('0 of 1 steps complete')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Week 1: Check entry requirements' }).check()
  await expect(page.getByText('1 of 1 steps complete')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Week 1: Check entry requirements' })).toBeChecked()
  await page.getByRole('button', { name: 'Remove plan' }).click()
  await expect(page.getByText(/No plans saved here yet/)).toBeVisible()
})

test('provider failures are visible and can be retried', async ({ page }) => {
  await page.route('**/api/advisor', route => route.fulfill({ status: 503, json: { error: 'The advisor is busy. Please try later.' } }))
  await page.goto('/results?occupation=4122&region=Calgary')
  await page.getByRole('checkbox', { name: /Send my skills/ }).check()
  const button = page.getByRole('button', { name: 'Build my action plan' })
  await button.click()
  await expect(page.getByText('The advisor is busy. Please try later.')).toBeVisible()
  await expect(button).toBeEnabled()
})
