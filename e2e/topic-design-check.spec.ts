import {test,expect} from './fixtures';
test.use({ viewport: {width:390,height:844} });
test('topic search, lesson search and mobile focus navigation', async({page})=>{
 await page.goto('/learn?school=language&lang=es&scope=all');
 const search=page.getByRole('searchbox',{name:'Find your next topic'});
 await search.fill('no-such-topic-987');
 await expect(page.getByText('No topics match these filters')).toBeVisible();
 await page.getByRole('button',{name:'Clear search and filters'}).click();
 await expect(search).toHaveValue('');
 await page.goto('/learn/11111111-1111-1111-1111-111111111111');
 await page.getByRole('searchbox',{name:'Find a lesson'}).fill('no-such-lesson-987');
 await expect(page.getByText('No lessons match yet')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();
 await page.getByRole('link',{name:/Greetings.*introductions/}).first().click();
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();
 await expect(page.getByRole('button',{name:'Show study panels'})).toHaveAttribute('aria-pressed','true');
 await page.getByText(/Course contents · lesson/).click();
 await expect(page.getByRole('link',{name:'Topic overview'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

});
