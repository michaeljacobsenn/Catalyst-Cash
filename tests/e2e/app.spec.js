import { test, expect } from '@playwright/test';

test.describe('Catalyst Cash E2E Tests', () => {
  test('should complete onboarding and navigate through the app', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/');
    await expect(page).toHaveTitle(/Catalyst Cash/);

    await expect(page.locator('text=Preparing your dashboard')).toBeHidden({ timeout: 15000 });

    const isSetupWizard = await page.locator('text=Welcome').count() > 0;
    
    if (isSetupWizard) {
      console.log('Navigating through Setup Wizard...');
      
      // Welcome
      await page.locator('p:has-text("I understand that this app")').locator('xpath=preceding-sibling::div').click();
      await page.waitForTimeout(500); 
      await page.screenshot({ path: 'test-results/step-welcome-checked.png' });
      await page.click('button:has-text("Let\'s Get Started")');
      
      // Import
      await expect(page.locator('text=Import Data').first()).toBeVisible();
      await page.screenshot({ path: 'test-results/step-import.png' });
      await page.click('button:has-text("Skip for Now")');
      
      // Pass1
      await expect(page.locator('text=Phase 1').first()).toBeVisible();
      await page.screenshot({ path: 'test-results/step-pass1.png' });
      await page.click('button:has-text("Next")');
      
      // Pass2
      await expect(page.locator('text=Phase 2').first()).toBeVisible();
      await page.screenshot({ path: 'test-results/step-pass2.png' });
      await page.click('button:has-text("Next")');
      
      // Pass3
      await expect(page.locator('text=Phase 3').first()).toBeVisible();
      await page.screenshot({ path: 'test-results/step-pass3.png' });
      await page.click('button:has-text("Save")');
      
      // Done
      await expect(page.locator('text=All Set').first()).toBeVisible();
      await page.screenshot({ path: 'test-results/step-done.png' });
      await page.click('button:has-text("Dashboard")');
    }

    // Wait for Dashboard nav
    await expect(page.locator('nav')).toBeVisible({ timeout: 15000 });
    console.log('Reached main application.');

    // Wait for animation
    await page.waitForTimeout(1000);

    // Click tabs
    await page.click('text=Accounts');
    await expect(page.locator('text=Accounts').first()).toBeVisible();
    await page.click('text=Expenses');
    await expect(page.locator('text=Expenses').first()).toBeVisible();

  });
});
