import React from 'react';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {expect,it} from 'vitest';
import {PaperMarkings} from './PaperMarkings';
it('shows saved errors and corrections without treating unknown judgments as incorrect',()=>{let tree!:ReactTestRenderer;act(()=>{tree=create(React.createElement(PaperMarkings,{annotations:[{label:'Q1',correct:false,detail:'Control omitted',correct_answer:'Use an untreated group'},{label:'Q2',detail:'Unreadable'},null]}));});expect(tree.root.findAllByProps({'aria-label':'Marked incorrect'})).toHaveLength(1);expect(tree.root.findAllByProps({'aria-label':'Not classified'})).toHaveLength(1);expect(JSON.stringify(tree.toJSON())).toContain('Use an untreated group');act(()=>tree.unmount());});
