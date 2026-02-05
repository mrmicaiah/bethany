import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

      {/* Profile section */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Profile</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              defaultValue={user?.name || ''}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              defaultValue={user?.email || ''}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={user?.phone || ''}
              disabled
              className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Phone number cannot be changed
            </p>
          </div>
          <button className="px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors">
            Save changes
          </button>
        </div>
      </div>

      {/* Subscription section */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Subscription</h2>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between max-w-md">
            <div>
              <p className="font-medium text-gray-900">
                {user?.subscriptionTier === 'premium'
                  ? 'Premium'
                  : user?.subscriptionTier === 'trial'
                  ? 'Trial'
                  : 'Free'}
              </p>
              <p className="text-sm text-gray-500">
                {user?.subscriptionTier === 'premium'
                  ? 'Unlimited contacts and features'
                  : user?.subscriptionTier === 'trial'
                  ? 'Full access during trial period'
                  : '15 contacts, limited features'}
              </p>
            </div>
            {user?.subscriptionTier !== 'premium' && (
              <button className="px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors">
                Upgrade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Export section */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Data</h2>
        </div>
        <div className="p-5">
          <button className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Export all contacts (CSV)
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Download a copy of all your contacts and interaction history
          </p>
        </div>
      </div>
    </div>
  );
}
