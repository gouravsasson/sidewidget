import { VoiceAssistant } from "./components/VoiceAssistant";
import { useState, useEffect, useRef } from "react";
import { useWidgetContext } from "./constexts/WidgetContext";
import { useUltravoxStore } from "./store/ultrasession";
import useSessionStore from "./store/session";
import axios from "axios";
import Forkartik from "./components/Forkartik";
import Autostart from "./components/Autostart";
import CustomWidget from "./components/CustomWidget";
import { WidgetTheme } from "./components/CustomWidget";
import TestWidget from "./components/TestWidget";
import German from "./components/German";

function App() {
  const [showPopup, setShowPopup] = useState(false);
  const { agent_id, schema, type } = useWidgetContext();

  useEffect(() => {
    const localCountryCode = localStorage.getItem("countryCode");
    if (!localCountryCode) {
      const fetchIp = async () => {
        const res = await axios.get("https://ipapi.co/json/");
        localStorage.setItem("countryCode", res.data.country_calling_code);
        localStorage.setItem("countryName", res.data.country_name);
        localStorage.setItem("continentcode", res.data.country);
        localStorage.setItem("city", res.data.city);
      };
      fetchIp();
    }
  }, []);

  const widgetMap: Record<string, JSX.Element> = {
    autostart: <Autostart />,
    normal: <Forkartik />,
    customwidget: <CustomWidget />,
    test: <TestWidget />,
    german:<German/>
  };

  return (
    widgetMap[type] || null
    //   <>
    // <TestWidget/>

    // <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
    //       {/* Hero Section */}
    //       <header className="bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-700 text-white py-24">
    //         <div className="max-w-7xl mx-auto px-6 text-center">
    //           <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
    //             Discover Kyoto in 2025
    //           </h1>
    //           <p className="text-xl md:text-2xl opacity-90 max-w-4xl mx-auto">
    //             Talk to Snowie AI — Ask anything about this page: prices, best time to visit, hidden gems, or even book your trip!
    //           </p>
    //           <div className="mt-10 inline-block bg-white/20 backdrop-blur px-10 py-5 rounded-full text-lg font-medium">
    //             Click the mic below and say: “Summarize this page” or “When should I visit Kyoto?”
    //           </div>
    //         </div>
    //       </header>

    //       {/* Main Featured Article */}
    //       <section className="py-20 bg-white">
    //         <div className="max-w-7xl mx-auto px-6">
    //           <div className="grid lg:grid-cols-2 gap-16 items-start">
    //             <div>
    //               <img
    //                 src="https://images.unsplash.com/photo-1545569341-9eb8b20d7d5d?w=1200&h=900&fit=crop"
    //                 alt="Fushimi Inari Taisha shrine gates in Kyoto, Japan"
    //                 className="rounded-2xl shadow-2xl w-full object-cover"
    //               />
    //               <p className="text-center text-sm text-gray-500 mt-4">
    //                 Fushimi Inari Taisha – Thousands of vermilion torii gates
    //               </p>
    //             </div>

    //             <div className="space-y-8">
    //               <h2 className="text-4xl md:text-5xl font-bold text-gray-900">
    //                 Why Kyoto Should Be Your Next Trip
    //               </h2>
    //               <p className="text-xl leading-relaxed text-gray-700">
    //                 Kyoto is Japan's soul. With <strong>17 UNESCO World Heritage sites</strong>, over{" "}
    //                 <strong>2,000 temples and shrines</strong>, and seasons that transform the city into a living painting — it's unmatched.
    //               </p>

    //               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
    //                 <div className="bg-purple-50 p-6 rounded-xl">
    //                   <h3 className="font-bold text-purple-900 text-lg">Best Time to Visit</h3>
    //                   <p className="text-2xl font-bold text-purple-700 mt-2">March 25 – April 15</p>
    //                   <p className="text-sm text-purple-600">Cherry Blossom Peak (Sakura)</p>
    //                 </div>
    //                 <div className="bg-indigo-50 p-6 rounded-xl">
    //                   <h3 className="font-bold text-indigo-900 text-lg">Alternative Season</h3>
    //                   <p className="text-2xl font-bold text-indigo-700 mt-2">Nov 15 – Dec 5</p>
    //                   <p className="text-sm text-indigo-600">Autumn Leaves (Koyo)</p>
    //                 </div>
    //               </div>

    //               <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-xl">
    //                 <p className="font-bold text-amber-900 text-lg">Pro Traveler Tip</p>
    //                 <p className="text-amber-800 mt-2">
    //                   Buy the <strong>Kyoto City One-Day Bus Pass (¥700)</strong> — unlimited rides on all city buses including to Arashiyama and Kinkaku-ji!
    //                 </p>
    //               </div>

    //               <ul className="space-y-4 text-lg">
    //                 <li className="flex items-start gap-3">
    //                   <span className="text-2xl text-purple-600">•</span>
    //                   <span><strong>Average flight from USA:</strong> $780–$1,200 round trip</span>
    //                 </li>
    //                 <li className="flex items-start gap-3">
    //                   <span className="text-2xl text-purple-600">•</span>
    //                   <span><strong>Daily budget (mid-range):</strong> $120–$180 per person</span>
    //                 </li>
    //                 <li className="flex items-start gap-3">
    //                   <span className="text-2xl text-purple-600">•</span>
    //                   <span><strong>Must-do:</strong> Tea ceremony in Gion, stay in a ryokan, visit Philosopher’s Path at sunrise</span>
    //                 </li>
    //               </ul>
    //             </div>
    //           </div>
    //         </div>
    //       </section>

    //       {/* More Destinations Grid */}
    //       <section className="py-20 bg-gray-100">
    //         <div className="max-w-7xl mx-auto px-6">
    //           <h2 className="text-4xl font-bold text-center mb-12">More Destinations for 2025</h2>

    //           <div className="grid md:grid-cols-3 gap-10">
    //             {[
    //               {
    //                 title: "Iceland Northern Lights",
    //                 img: "https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=800&h=600&fit=crop",
    //                 price: "$1,200–$2,000",
    //                 best: "Sep–Mar",
    //               },
    //               {
    //                 title: "Santorini Sunsets",
    //                 img: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&h=600&fit=crop",
    //                 price: "$900–$1,800",
    //                 best: "May–Jun, Sep–Oct",
    //               },
    //               {
    //                 title: "Machu Picchu Trek",
    //                 img: "https://images.unsplash.com/photo-1587595431973-160d0d2bedc3?w=800&h=600&fit=crop",
    //                 price: "$1,500–$2,800",
    //                 best: "May–Sep (dry season)",
    //               },
    //             ].map((dest) => (
    //               <article
    //                 key={dest.title}
    //                 className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition transform hover:-translate-y-2"
    //               >
    //                 <img src={dest.img} alt={dest.title} className="w-full h-64 object-cover" />
    //                 <div className="p-6">
    //                   <h3 className="text-2xl font-bold mb-3">{dest.title}</h3>
    //                   <div className="space-y-2 text-gray-600">
    //                     <p><strong>Trip Cost:</strong> {dest.price}</p>
    //                     <p><strong>Best Time:</strong> {dest.best}</p>
    //                   </div>
    //                   <a href="#" className="text-purple-600 font-semibold mt-4 inline-block hover:underline">
    //                     Learn more →
    //                   </a>
    //                 </div>
    //               </article>
    //             ))}
    //           </div>
    //         </div>
    //       </section>

    //       {/* Final CTA */}
    //       <section className="py-24 bg-gradient-to-r from-indigo-700 to-purple-800 text-white">
    //         <div className="max-w-4xl mx-auto text-center px-6">
    //           <h2 className="text-5xl font-bold mb-8">Ready to Go?</h2>
    //           <p className="text-2xl mb-10 opacity-90">
    //             Just click the microphone and ask me anything:
    //           </p>
    //           <div className="text-xl space-y-4 font-medium bg-white/10 backdrop-blur rounded-2xl p-8 inline-block">
    //             <p>“What’s the cheapest month to visit Kyoto?”</p>
    //             <p>“Summarize the best time to see cherry blossoms”</p>
    //             <p>“Compare Kyoto vs Tokyo for first-timers”</p>
    //             <p>“Show me a 5-day itinerary”</p>
    //           </div>
    //         </div>
    //       </section>

    //       {/* Footer */}
    //       <footer className="bg-gray-900 text-white py-12 text-center">
    //         <p className="text-lg">Snowie AI • Voice Widget + get_page_details() Demo</p>
    //         <p className="text-gray-400 mt-2">
    //           This entire page is readable by your AI using the <code className="bg-gray-800 px-2 rounded">get_page_details</code> tool
    //         </p>
    //       </footer>
    //     </div>
    //   </>
  );
}

export default App;
