import {test,expect} from './fixtures';
const course='/learn/bbbb0004-0000-4000-8000-000000000001';
for(const width of [390,1440]){
 test(`biology practice stays in the lesson at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.goto(course);
  await page.getByRole('link',{name:/scientific method.*characteristics of life/i}).first().click();
  await page.waitForURL(/\/learn\/[^/]+\/[^/]+$/);
  const lessonUrl=page.url();
  const journey=page.getByTestId('reading-journey');
  await expect(journey).toBeVisible();
  await expect(page.getByRole('link',{name:'Speak',exact:true})).toHaveCount(0);
  await journey.getByRole('button',{name:'Practice',exact:true}).click();
  expect(page.url()).toBe(lessonUrl);
  await expect(journey.getByRole('textbox',{name:'Your thinking'})).toBeVisible();
  await expect(journey.getByText('Compare your reasoning',{exact:true})).toHaveCount(0);
  await journey.getByRole('textbox',{name:'Your thinking'}).fill('I would compare a treatment with a control.');
  await journey.getByRole('button',{name:'Reveal explanation',exact:true}).click();
  await expect(journey.getByText('Compare your reasoning',{exact:true})).toBeVisible();
  await journey.getByRole('button',{name:'Next step →',exact:true}).click();
  await expect(journey.getByText('Compare your reasoning',{exact:true})).toHaveCount(0);
  await journey.getByRole('button',{name:'Back',exact:true}).click();
  await expect(journey.getByRole('textbox',{name:'Your thinking'})).toHaveValue('I would compare a treatment with a control.');
  await expect(journey.getByText('Compare your reasoning',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/reading-biology-${width}.png`,fullPage:true});
  await journey.getByRole('button',{name:'Review',exact:true}).click();
  await expect(journey.getByText('Worked cases',{exact:true}).first()).toBeVisible();
  expect(page.url()).toBe(lessonUrl);
 });
}
