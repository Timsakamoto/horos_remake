import { PACSQueryForm } from './PACSQueryForm';
import { PACSResults } from './PACSResults';

export const PACSMain = () => {
    return (
        <div className="flex flex-col w-full h-full bg-white overflow-hidden">
            <PACSQueryForm />
            <div className="flex-1 flex flex-col min-h-0">
                <div className="px-8 py-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center text-[10px] font-black text-gray-300 uppercase tracking-widest">
                    <span>Query Results</span>
                    <div className="flex gap-4">
                        <span>DICOMweb Active</span>
                    </div>
                </div>
                <PACSResults />
            </div>
        </div>
    );
};
