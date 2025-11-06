import { LoginButton } from './LoginButton'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-blue-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="text-center space-y-8">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight">
              Welcome to <span className="text-amber-400">AnteTown</span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Clubs, tables, and nightly fun. Jump in with friends, meet new rivals, and play your way.
            </p>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Seasonal festivals include real-world prizes with clear rules and a free way to enter.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <LoginButton className="px-8 py-4 text-lg font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-lg transition-colors" />
              <button className="px-8 py-4 text-lg font-semibold bg-transparent border-2 border-amber-400 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors">
                Join a club
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Social Value Pillars */}
      <section className="bg-slate-900/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center space-y-4">
              <div className="text-4xl">🎮</div>
              <h3 className="text-2xl font-bold text-amber-400">Your place to play</h3>
              <p className="text-gray-300">
                Find a seat fast, chat at the table, and run it back. No pressure, just good games.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="text-4xl">🏆</div>
              <h3 className="text-2xl font-bold text-amber-400">Clubs and community</h3>
              <p className="text-gray-300">
                Start a club or join one. Set simple goals, earn décor, and host your own club nights.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="text-4xl">🎪</div>
              <h3 className="text-2xl font-bold text-amber-400">Seasons and festivals</h3>
              <p className="text-gray-300">
                New themes, fresh challenges, and a prize festival on a regular cadence. Prizes are a bonus, not the point.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How AnteTown Works */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-12">How AnteTown works</h2>

          <div className="space-y-6 text-left">
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
              <p className="text-gray-200 text-lg">
                <span className="text-amber-400 font-semibold">Play any time.</span> Daily freerolls mean there is always a seat.
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
              <p className="text-gray-200 text-lg">
                <span className="text-amber-400 font-semibold">Grow with your crew.</span> Club goals unlock décor, frames, and showcase spots.
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
              <p className="text-gray-200 text-lg">
                <span className="text-amber-400 font-semibold">Climb a season ladder</span> for titles and cosmetics. No pay to win.
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
              <p className="text-gray-200 text-lg">
                <span className="text-amber-400 font-semibold">When festival week arrives,</span> you can enter free by play or by alternate entry. Purchases do not improve chances.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Modes Preview */}
      <section className="bg-slate-900/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white text-center mb-16">Modes preview</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 hover:border-amber-400/50 transition-colors">
              <h3 className="text-xl font-bold text-amber-400 mb-3">Tables</h3>
              <p className="text-gray-300">
                Quick seats, private tables, or club rooms. Easy invites for friends.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 hover:border-amber-400/50 transition-colors">
              <h3 className="text-xl font-bold text-amber-400 mb-3">Clubs</h3>
              <p className="text-gray-300">
                Shared goals, a club chat, and a clubhouse you can decorate over time.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 hover:border-amber-400/50 transition-colors">
              <h3 className="text-xl font-bold text-amber-400 mb-3">Season ladder</h3>
              <p className="text-gray-300">
                Play to earn rank and cosmetics. Titles carry forward between seasons.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 hover:border-amber-400/50 transition-colors">
              <h3 className="text-xl font-bold text-amber-400 mb-3">Qualifiers</h3>
              <p className="text-gray-300">
                Skill challenges with fixed rules and posted scoring during festival weeks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Festival Week */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <h2 className="text-4xl font-bold text-white">Festival week</h2>
          <p className="text-xl text-gray-300">
            Prize events run on a schedule. Enter through normal play or use the free alternate entry. Odds and rules are posted for each event.
          </p>
          <button className="px-8 py-4 text-lg font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-lg transition-colors">
            See festival dates
          </button>
          <p className="text-sm text-gray-400 max-w-2xl mx-auto pt-4">
            No purchase required. Purchases do not increase chances of winning.
          </p>
        </div>
      </section>

      {/* Trust and Safety */}
      <section className="bg-slate-900/50 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Trust and safety</h2>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-gray-300">Clear rules and age gates</p>
            </div>
            <div>
              <p className="text-gray-300">Region controls for compliance</p>
            </div>
            <div>
              <p className="text-gray-300">Player reporting and fair play tools</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-500 text-center max-w-4xl mx-auto leading-relaxed">
            No purchase necessary. Open to eligible players 18 or older in supported regions.
            Each festival has its own Official Rules with eligibility, timing, entry methods, and prize details.
            Purchases do not improve chances of winning. Alternate entry is always available.
            Skill events use posted scoring. Winners are verified before awards are issued.
          </p>
          <div className="mt-8 flex justify-center gap-8 text-sm text-gray-400">
            <a href="#" className="hover:text-amber-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Rules</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
