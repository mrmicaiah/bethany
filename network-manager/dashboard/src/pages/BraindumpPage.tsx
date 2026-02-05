import { Brain } from 'lucide-react';

export function BraindumpPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Braindump</h1>
      <p className="text-gray-500 mb-6">
        Just type or paste everything you know about your contacts. I'll sort it out.
      </p>

      <div className="bg-white rounded-xl border border-gray-200">
        <textarea
          placeholder="Sarah Chen - college roommate, lives in Denver now, works at Google. Should catch up monthly. Last talked about 3 weeks ago about her new job.

Mom - call every Sunday. She mentioned wanting to visit in March.

Jake from work - grab lunch sometime, he knows a lot about the startup scene..."
          className="w-full h-64 p-5 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-bethany-500 focus:ring-inset"
        />
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            <Brain className="w-4 h-4 inline mr-1" />
            I'll extract contacts, relationships, and notes automatically
          </p>
          <button className="px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors">
            Process
          </button>
        </div>
      </div>
    </div>
  );
}
