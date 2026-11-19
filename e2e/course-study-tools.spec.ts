import {test,expect} from './fixtures';
const id='bbbb0004-0000-4000-8000-000000000001';
test('biology has course exams, topic flashcards and a working review submission',async({page})=>{
 await page.goto(`/assessments/course/${id}`);
 await expect(page.getByRole('heading',{name:'Concepts of Biology',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Start exam',exact:true})).toHaveCount(4);
 await expect(page.getByRole('link',{name:'Start quiz',exact:true})).toHaveCount(12);
 await page.getByRole('link',{name:'Start quiz',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Submit and review'})).toBeVisible();
 for(const field of await page.locator('fieldset').all()){
  const radio=field.locator('input[type=radio]');if(await radio.count())await radio.first().check();else await field.locator('textarea').fill('My explanation based on the course material.');
 }
 await page.getByRole('button',{name:'Submit and review'}).click();
 await expect(page.getByRole('heading',{name:'Your review',exact:true})).toBeVisible();
 await page.goto(`/review?course=${id}`);
 await expect(page.getByRole('heading',{name:'Concepts of Biology',exact:true})).toBeVisible();
 await expect(page.getByText('hola',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Show answer',exact:true}).click();
 await expect(page.getByRole('link',{name:'Review source lesson →'})).toHaveAttribute('href',new RegExp(`/learn/${id}/`));
 await page.goto('/learn?school=science&scope=all');
 await page.getByRole('searchbox',{name:'Find your next topic'}).fill('Concepts of Biology');
 await expect(page.getByAltText('Leaf with water droplets illustration')).toBeVisible();
 await page.screenshot({path:'/tmp/learning-catalog-final.png',fullPage:true});
});
test('teacher demo shows complete fictional marking without provisioning a student',async({page})=>{
 await page.goto('/demo/graded-paper');
 await expect(page.getByRole('heading',{name:'A fully marked paper'})).toBeVisible();
 await expect(page.getByText('80/100',{exact:true})).toBeVisible();
 await expect(page.locator('section del')).toHaveCount(4);await expect(page.locator('section ins')).toHaveCount(4);
 await expect(page.getByText('Teacher feedback',{exact:true})).toHaveCount(4);
 await page.screenshot({path:'/tmp/teacher-marked-paper.png',fullPage:true});
 await page.getByRole('button',{name:'View original work'}).click();
 await expect(page.locator('del')).toHaveCount(0);
});
test('family demo separates attendance and study and shares evidence with teacher',async({page})=>{
 await page.goto('/demo/student-report');
 await expect(page.getByRole('heading',{name:'John Doe’s learning report'})).toBeVisible();
 await expect(page.getByText('58% · Below passing threshold',{exact:true})).toBeVisible();
 const row=page.getByRole('row').filter({hasText:'2026-11-12'});
 await expect(row).toContainText('present');await expect(row).toContainText('0');
 await page.getByRole('button',{name:'Teacher view',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Teacher workspace'})).toBeVisible();
 await expect(page.getByText('58% · Below passing threshold',{exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/family-report.png',fullPage:true});
});
