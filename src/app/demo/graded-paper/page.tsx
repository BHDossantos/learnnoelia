import {requireUser} from '@/lib/auth';
import {MarkedPaper} from './MarkedPaper';
export const metadata={title:'Teacher demo · fully marked paper'};
export default async function Page(){await requireUser();return <MarkedPaper/>;}
