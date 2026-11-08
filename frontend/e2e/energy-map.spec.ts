import { test, expect } from '@playwright/test'

test('energy explorer filters real projects and opens regional role outlooks', async ({ page }) => {
  await page.goto('/results?occupation=7220&region=Calgary')
  const explorer = page.getByRole('region', { name: 'Explore energy activity' })
  await expect(explorer.getByRole('heading', { name: /developments in Calgary/ })).toBeVisible()
  await explorer.getByRole('button', { name: 'Edmonton', exact: true }).click()
  await expect(explorer.getByRole('heading', { name: /developments in Edmonton/ })).toBeVisible()
  await explorer.getByRole('combobox', { name: 'Development type' }).click()
  await page.getByRole('option', { name: 'Data centres', exact: true }).click()
  await explorer.getByRole('button', { name: /GLDC Load Phase 1.1/ }).click()
  await expect(explorer.getByText(/Planning area 33/)).toBeVisible()
  await expect(explorer.getByText(/Your occupation:/)).toContainText(/electrical trades/i)
  const role = explorer.locator('ol a').first()
  await expect(role).toHaveAttribute('href', /region=Edmonton/)
  await role.click()
  await expect(page).toHaveURL(/region=Edmonton/)
})
