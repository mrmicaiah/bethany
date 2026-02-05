import { useAuth } from '../context/AuthContext';

export function OverviewPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        Hey, {user?.name?.split(' ')[0] || 'there'} 👋
      </h1>

      {/* Health summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Healthy</span>
            <div className="w-3 h-3 bg-green-500 rounded-full" />
          </div>
          <p className="text-3xl font-semibold text-gray-900 mt-2">--</p>
          <p className="text-xs text-gray-500 mt-1">contacts on track</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Needs attention</span>
            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          </div>
          <p className="text-3xl font-semibold text-gray-900 mt-2">--</p>
          <p className="text-xs text-gray-500 mt-1">slipping away</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Overdue</span>
            <div className="w-3 h-3 bg-red-500 rounded-full" />
          </div>
          <p className="text-3xl font-semibold text-gray-900 mt-2">--</p>
          <p className="text-xs text-gray-500 mt-1">need outreach</p>
        </div>
      </div>

      {/* Recent nudges */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Recent nudges</h2>
        </div>
        <div className="p-5 text-center text-gray-500">
          <p>No nudges yet. Add some contacts to get started!</p>
        </div>
      </div>
    </div>
  );
}
