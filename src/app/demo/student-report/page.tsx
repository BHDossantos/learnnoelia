import {requireUser} from '@/lib/auth';
import {StudentReport} from './StudentReport';
export const metadata={title:'John Doe · family and teacher report demo'};
export default async function Page(){await requireUser();return <StudentReport/>;}
