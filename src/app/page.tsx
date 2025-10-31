import { CivicSparkWidget } from '@/components/CivicSparkWidget';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Welcome to CivicSpark Tulsa
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Your AI-powered guide to understanding Tulsa city ordinances and staying informed
            on City Council agendas.
          </p>

          {/* Features */}
          <div className="grid md:grid-cols-2 gap-8 mt-16 text-left">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">💬</div>
              <h3 className="text-xl font-semibold mb-3">Ask Questions</h3>
              <p className="text-gray-600">
                Get plain-English explanations of city ordinances, zoning codes, and
                regulations. All answers include citations to official sources.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">📋</div>
              <h3 className="text-xl font-semibold mb-3">Stay Informed</h3>
              <p className="text-gray-600">
                Receive weekly digests of City Council agenda items that match your interests
                and district. Never miss what matters to you.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold mb-3">Topic-Based Alerts</h3>
              <p className="text-gray-600">
                Choose topics like housing, zoning, transportation, and more. Get notified
                only about agenda items relevant to your interests.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold mb-3">AI-Powered Search</h3>
              <p className="text-gray-600">
                Our RAG system searches through Tulsa's Municode and Zoning Code to find
                exactly what you need, explained at an 8th-grade reading level.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 bg-blue-600 text-white p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Get Started</h2>
            <p className="mb-6">
              Click the chat button in the bottom-right corner to start asking questions!
            </p>
            <p className="text-sm text-blue-100">
              This is a volunteer community project. All information is for educational
              purposes only and does not constitute legal advice.
            </p>
          </div>
        </div>
      </div>

      {/* Chat Widget */}
      <CivicSparkWidget />
    </main>
  );
}

