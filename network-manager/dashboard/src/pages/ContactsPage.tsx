import { Users } from 'lucide-react';

export function ContactsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
        <button className="px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors">
          Add contact
        </button>
      </div>

      {/* Empty state */}
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h2>
        <p className="text-gray-500 mb-6 max-w-sm mx-auto">
          Start by adding the people you want to stay connected with, or use braindump to add many at once.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button className="px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors">
            Add contact
          </button>
          <button className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Try braindump
          </button>
        </div>
      </div>
    </div>
  );
}
