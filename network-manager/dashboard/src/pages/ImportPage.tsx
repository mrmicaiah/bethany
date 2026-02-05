import { Upload, FileSpreadsheet, Smartphone } from 'lucide-react';

export function ImportPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Import</h1>
      <p className="text-gray-500 mb-6">
        Bring in your existing contacts from other sources.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CSV upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-6 h-6 text-gray-600" />
          </div>
          <h2 className="font-medium text-gray-900 mb-2">CSV file</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload a spreadsheet with names, phone numbers, and email addresses.
          </p>
          <button className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Choose file
          </button>
        </div>

        {/* Phone contacts */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <Smartphone className="w-6 h-6 text-gray-600" />
          </div>
          <h2 className="font-medium text-gray-900 mb-2">Phone contacts</h2>
          <p className="text-sm text-gray-500 mb-4">
            Export your phone's contacts as a .vcf file and upload it here.
          </p>
          <button className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Choose file
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-gray-50 rounded-xl p-6">
        <h3 className="font-medium text-gray-900 mb-3">How to export phone contacts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-800 mb-2">iPhone</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open iCloud.com on a computer</li>
              <li>Go to Contacts</li>
              <li>Select All Contacts</li>
              <li>Click the gear icon → Export vCard</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-gray-800 mb-2">Android</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open the Contacts app</li>
              <li>Tap Menu → Settings</li>
              <li>Tap Export</li>
              <li>Choose where to save the .vcf file</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
