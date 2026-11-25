import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { 
  Car, 
  MapPin, 
  Navigation, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  DollarSign, 
  User, 
  Star, 
  ArrowRight,
  Sliders,
  AlertTriangle,
  ShieldAlert,
  LifeBuoy,
  Radio,
  PhoneCall,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import StatCard from '../components/StatCard';
import RideLifecycleTimeline from '../components/RideLifecycleTimeline';
import RideMap from '../components/RideMap';
import { 
  getSocket, 
  joinRideRoom, 
  leaveRideRoom, 
  onRideStatusChanged, 
  onDriverLocation,
  onNoDriversAvailable,
  emitPassengerSosLocation,
  onSosRescueDispatched,
  onSurgePricingUpdated
} from '../services/socket';
import './PassengerPortal.css';

const AHMEDABAD_LOCATIONS = [
  // West Ahmedabad
  {
    name: 'SG Highway (Iscon Cross Road)',
    shortName: 'SG Highway (Iscon)',
    subtitle: 'Sarkhej-Gandhinagar Highway • Iscon Mega Mall',
    lat: 23.0275,
    lng: 72.5076,
    keywords: ['sg highway', 'iscon', 'iskcon', 'cross road', 'thaltej', 'sarkhej', 's.g. highway', 'west']
  },
  {
    name: 'Vastrapur Lake / AlphaOne Mall',
    shortName: 'Vastrapur Lake',
    subtitle: 'Vastrapur • Ahmedabad One Mall • IIM Road',
    lat: 23.0373,
    lng: 72.5303,
    keywords: ['vastrapur', 'lake', 'alphaone', 'alpha one', 'mall', 'amrut', 'ahmedabad one', 'iim', 'west']
  },
  {
    name: 'Sindhu Bhavan Road (SBR)',
    shortName: 'Sindhu Bhavan Road',
    subtitle: 'SBR • Taj Skyline • High Street Dining',
    lat: 23.0450,
    lng: 72.5015,
    keywords: ['sindhu bhavan', 'sbr', 'sindhubhavan', 'taj skyline', 'times square', 'gotila', 'west']
  },
  {
    name: 'Bodakdev / Judges Bungalow Road',
    shortName: 'Bodakdev',
    subtitle: 'Judges Bungalow • Pakwan Cross Road',
    lat: 23.0425,
    lng: 72.5185,
    keywords: ['bodakdev', 'judges bungalow', 'pakwan', 'keshavbaug', 'vastrapur station', 'west']
  },
  {
    name: 'Thaltej Cross Road / Acropolis Mall',
    shortName: 'Thaltej',
    subtitle: 'Thaltej Metro Station • Acropolis Mall • Drive In',
    lat: 23.0505,
    lng: 72.5175,
    keywords: ['thaltej', 'acropolis', 'surdhara', 'thaltej cross road', 'metro station', 'west']
  },
  {
    name: 'Satellite / Shyamal Cross Road',
    shortName: 'Satellite',
    subtitle: 'Shyamal • Shivranjani • Manekbaug',
    lat: 23.0185,
    lng: 72.5285,
    keywords: ['satellite', 'shyamal', 'shivranjani', 'manekbaug', 'jodhpur cross road', 'west']
  },
  {
    name: 'Prahlad Nagar Corporate Road',
    shortName: 'Prahlad Nagar',
    subtitle: 'Prahladnagar • Corporate Road • Garden',
    lat: 23.0125,
    lng: 72.5108,
    keywords: ['prahlad nagar', 'prahladnagar', 'corporate road', 'vejalpur', 'anandnagar', 'garden', 'west']
  },
  {
    name: 'Bopal / South Bopal 4 Rasta',
    shortName: 'Bopal',
    subtitle: 'South Bopal • Sobo Center • Ghuma Road',
    lat: 23.0345,
    lng: 72.4680,
    keywords: ['bopal', 'south bopal', 'ghuma', 'sobo', 'sobo center', 'sun south street', 'ring road', 'west']
  },
  {
    name: 'Shela / Club O7',
    shortName: 'Shela (Club O7)',
    subtitle: 'Shela • Club O7 • Sanand Circle Road',
    lat: 23.0085,
    lng: 72.4590,
    keywords: ['shela', 'club o7', 'vip road', 'shanti asiatic', 'sanand circle', 'west']
  },
  {
    name: 'Science City / Hebatpur Road',
    shortName: 'Science City',
    subtitle: 'Science City • Aquatic Gallery • IMAX',
    lat: 23.0785,
    lng: 72.4985,
    keywords: ['science city', 'hebatpur', 'aquatic gallery', 'imax', 'gujarat science city', 'west']
  },
  {
    name: 'Sola / CIMS Hospital & High Court',
    shortName: 'Sola (High Court)',
    subtitle: 'Gujarat High Court • CIMS Hospital • Sola Bridge',
    lat: 23.0715,
    lng: 72.5210,
    keywords: ['sola', 'high court', 'cims', 'cims hospital', 'gujarat high court', 'sola bridge', 'west']
  },
  {
    name: 'Gota / Vandematram Cross Road',
    shortName: 'Gota',
    subtitle: 'Gota • Vandematram • Chandlodiya Road',
    lat: 23.0945,
    lng: 72.5360,
    keywords: ['gota', 'vandematram', 'gota bridge', 'chandlodiya', 'shree balaji', 'west']
  },
  {
    name: 'Ghatlodiya / Rannapark',
    shortName: 'Ghatlodiya',
    subtitle: 'Rannapark • Chanakyapuri • KK Nagar',
    lat: 23.0650,
    lng: 72.5450,
    keywords: ['ghatlodiya', 'rannapark', 'chanakyapuri', 'kk nagar', 'prabhat chowk', 'west']
  },
  {
    name: 'Memnagar / Sterling Hospital',
    shortName: 'Memnagar',
    subtitle: 'Sterling Hospital • Subhash Chowk • Drive-In',
    lat: 23.0510,
    lng: 72.5360,
    keywords: ['memnagar', 'sterling', 'sterling hospital', 'subhash chowk', 'sal hospital', 'west']
  },
  {
    name: 'Gurukul Road / Drive-In Cinema',
    shortName: 'Gurukul (Drive-In)',
    subtitle: 'Drive-In Cinema • Nilmani • Memnagar',
    lat: 23.0475,
    lng: 72.5320,
    keywords: ['gurukul', 'drive-in', 'drive in', 'drive in road', 'sunset drive-in', 'nilmani', 'west']
  },
  {
    name: 'Ambawadi / Panjrapole Cross Road',
    shortName: 'Ambawadi',
    subtitle: 'Panjrapole • Polytechnic • IIM Circle',
    lat: 23.0210,
    lng: 72.5475,
    keywords: ['ambawadi', 'panjrapole', 'polytechnic', 'iim circle', 'manekbaug', 'central-west']
  },
  {
    name: 'Jodhpur Cross Road / Star Bazaar',
    shortName: 'Jodhpur Village',
    subtitle: 'Star Bazaar • ISRO Colony • Ramdevnagar',
    lat: 23.0255,
    lng: 72.5230,
    keywords: ['jodhpur', 'star bazaar', 'isro', 'ramdevnagar', 'prernatirth', 'west']
  },
  {
    name: 'Anandnagar / 100 Feet Road',
    shortName: 'Anandnagar',
    subtitle: '100 Feet Road • Prahladnagar Connector',
    lat: 23.0145,
    lng: 72.5180,
    keywords: ['anandnagar', '100 feet road', 'vejalpur road', 'seema hall', 'west']
  },
  {
    name: 'Vejalpur / Bakeri City',
    shortName: 'Vejalpur',
    subtitle: 'Bakeri City • Srinandnagar • Butbhavani',
    lat: 23.0035,
    lng: 72.5240,
    keywords: ['vejalpur', 'bakeri city', 'srinandnagar', 'butbhavani', 'south-west']
  },
  {
    name: 'Makarba / Corporate Road Hub',
    shortName: 'Makarba',
    subtitle: 'Makarba • Safal Pegasus • SG Highway South',
    lat: 22.9920,
    lng: 72.5040,
    keywords: ['makarba', 'safal pegasus', 'corporate hub', 'sarkhej station', 'south-west']
  },
  {
    name: 'Naranpura / AEC Cross Road',
    shortName: 'Naranpura',
    subtitle: 'AEC Cross Road • Pallav • Ankur Cross Road',
    lat: 23.0570,
    lng: 72.5530,
    keywords: ['naranpura', 'aec', 'ankur', 'pallav', 'shastri nagar', 'west']
  },
  {
    name: 'Shilaj / Shilaj Circle SP Ring Road',
    shortName: 'Shilaj',
    subtitle: 'Shilaj Circle • SP Ring Road • Science City West',
    lat: 23.0610,
    lng: 72.4820,
    keywords: ['shilaj', 'shilaj circle', 'ring road', 'west']
  },
  {
    name: 'Ghuma / Ghuma Bus Stand',
    shortName: 'Ghuma',
    subtitle: 'Ghuma Gam • Bopal West • Krishna Nagar',
    lat: 23.0260,
    lng: 72.4490,
    keywords: ['ghuma', 'bopal ghuma', 'krishna nagar', 'west']
  },

  // Central / Old City Ahmedabad
  {
    name: 'Navrangpura (CG Road)',
    shortName: 'Navrangpura',
    subtitle: 'C.G. Road • Mithakhali • Commerce Six Roads',
    lat: 23.0372,
    lng: 72.5613,
    keywords: ['navrangpura', 'cg road', 'c.g. road', 'mithakhali', 'law garden', 'gulbai tekra', 'central']
  },
  {
    name: 'Sabarmati Riverfront (Ashram Road)',
    shortName: 'Sabarmati Riverfront',
    subtitle: 'Ashram Road • Promenade & Gandhi Ashram',
    lat: 23.0338,
    lng: 72.5714,
    keywords: ['sabarmati', 'riverfront', 'ashram road', 'gandhi ashram', 'promenade', 'subhash bridge', 'central']
  },
  {
    name: 'Ellis Bridge / Town Hall',
    shortName: 'Ellis Bridge',
    subtitle: 'Town Hall • VS Hospital • Tagore Hall',
    lat: 23.0245,
    lng: 72.5710,
    keywords: ['ellis bridge', 'ellisbridge', 'town hall', 'vs hospital', 'tagore hall', 'central']
  },
  {
    name: 'Paldi / Mahalaxmi Five Roads',
    shortName: 'Paldi',
    subtitle: 'Paldi • Kocharab Ashram • NID Campus',
    lat: 23.0115,
    lng: 72.5620,
    keywords: ['paldi', 'anjali', 'kocharab', 'bhatta', 'mahalaxmi', 'nid', 'central']
  },
  {
    name: 'Ashram Road / Income Tax Cross Road',
    shortName: 'Income Tax (Ashram Rd)',
    subtitle: 'Income Tax Office • Sales India • Bata Showroom',
    lat: 23.0415,
    lng: 72.5705,
    keywords: ['income tax', 'ashram road', 'sales india', 'vadaj', 'central']
  },
  {
    name: 'Usmanpura / Gujarat Vidyapith',
    shortName: 'Usmanpura',
    subtitle: 'Gujarat Vidyapith • Fortune Landmark • Riverfront',
    lat: 23.0485,
    lng: 72.5715,
    keywords: ['usmanpura', 'vidyapith', 'gujarat vidyapith', 'fortune landmark', 'central']
  },
  {
    name: 'Shahibaug / Circuit House & Camp',
    shortName: 'Shahibaug',
    subtitle: 'Circuit House • Army Camp • Dafnala',
    lat: 23.0560,
    lng: 72.5960,
    keywords: ['shahibaug', 'circuit house', 'camp', 'dafname', 'army camp', 'central']
  },
  {
    name: 'Ahmedabad Junction (Kalupur Railway Station)',
    shortName: 'Kalupur Station',
    subtitle: 'Kalupur • Main Central Railway Station & Metro',
    lat: 23.0233,
    lng: 72.6006,
    keywords: ['kalupur', 'railway', 'station', 'junction', 'train', 'central station', 'railway station', 'central']
  },
  {
    name: 'Gita Mandir ST Central Bus Terminus',
    shortName: 'Gita Mandir (ST Bus)',
    subtitle: 'Gita Mandir • Central GSRTC Bus Stand',
    lat: 23.0135,
    lng: 72.5885,
    keywords: ['gita mandir', 'geeta mandir', 'st bus', 'bus stand', 'terminus', 'gsrtc', 'astodia', 'central']
  },
  {
    name: 'Lal Darwaja / Bhadra Fort',
    shortName: 'Lal Darwaja',
    subtitle: 'Bhadra Fort • City Bus Terminus • APMC',
    lat: 23.0265,
    lng: 72.5810,
    keywords: ['lal darwaja', 'bhadra', 'bhadra fort', 'amts', 'central']
  },
  {
    name: 'Gandhi Road / Manek Chowk',
    shortName: 'Manek Chowk',
    subtitle: 'Manek Chowk Night Market • Gold Bazaar • Jama Masjid',
    lat: 23.0240,
    lng: 72.5890,
    keywords: ['manek chowk', 'gandhi road', 'night market', 'jama masjid', 'old city', 'central']
  },
  {
    name: 'Delhi Gate / Mirzapur',
    shortName: 'Delhi Gate',
    subtitle: 'Delhi Darwaja • Mirzapur Court • Dariyapur',
    lat: 23.0360,
    lng: 72.5895,
    keywords: ['delhi gate', 'delhi darwaja', 'mirzapur', 'dariyapur', 'central']
  },
  {
    name: 'Jamalpur / Sardar Bridge',
    shortName: 'Jamalpur',
    subtitle: 'Jamalpur APMC Flower Market • Jagannath Temple',
    lat: 23.0110,
    lng: 72.5790,
    keywords: ['jamalpur', 'sardar bridge', 'jagannath temple', 'flower market', 'central']
  },

  // East Ahmedabad
  {
    name: 'Maninagar / Kankaria Lake & Zoo',
    shortName: 'Kankaria Lake',
    subtitle: 'Maninagar • Kankaria Zoo • Balvatika • Fast Track',
    lat: 22.9978,
    lng: 72.6025,
    keywords: ['maninagar', 'kankaria', 'lake', 'zoo', 'balvatika', 'kankaria lake', 'dakshini', 'east']
  },
  {
    name: 'Bapunagar / India Colony',
    shortName: 'Bapunagar',
    subtitle: 'India Colony • Diamond Market • Shyam Shikhar',
    lat: 23.0410,
    lng: 72.6280,
    keywords: ['bapunagar', 'india colony', 'diamond market', 'shyam shikhar', 'east']
  },
  {
    name: 'Nikol / Naroda Ring Road',
    shortName: 'Nikol',
    subtitle: 'Nikol Gam • Raspan Arcade • SP Ring Road',
    lat: 23.0550,
    lng: 72.6650,
    keywords: ['nikol', 'naroda', 'ring road', 'raspan', 'nikol gam', 'east']
  },
  {
    name: 'Naroda / Naroda GIDC & Fruit Market',
    shortName: 'Naroda',
    subtitle: 'Naroda Patiya • GIDC Phase 1 • Fruit Market',
    lat: 23.0690,
    lng: 72.6610,
    keywords: ['naroda', 'naroda gidc', 'fruit market', 'naroda patiya', 'muthia', 'east']
  },
  {
    name: 'Odhav / Odhav Industrial GIDC',
    shortName: 'Odhav',
    subtitle: 'Odhav Ring Road • GIDC • Chhatral Connector',
    lat: 23.0240,
    lng: 72.6620,
    keywords: ['odhav', 'odhav ring road', 'odhav gidc', 'singarva', 'east']
  },
  {
    name: 'Vastral / Vastral Gam Metro Station',
    shortName: 'Vastral',
    subtitle: 'Vastral Gam Metro • Ratanpura • SP Ring Road',
    lat: 22.9985,
    lng: 72.6520,
    keywords: ['vastral', 'vastral metro', 'nirant cross road', 'sp ring road', 'east']
  },
  {
    name: 'Amraiwadi / Rabari Colony Metro',
    shortName: 'Amraiwadi',
    subtitle: 'Rabari Colony Metro • CTM Road',
    lat: 23.0065,
    lng: 72.6280,
    keywords: ['amraiwadi', 'rabari colony', 'rabari colony metro', 'east']
  },
  {
    name: 'Rakhial / Ajit Mill Cross Road',
    shortName: 'Rakhial',
    subtitle: 'Ajit Mill • Soni Ni Chali • Monogram',
    lat: 23.0190,
    lng: 72.6210,
    keywords: ['rakhial', 'ajit mill', 'soni ni chali', 'east']
  },
  {
    name: 'Saraspur / Saraspur Darwaja',
    shortName: 'Saraspur',
    subtitle: 'Saraspur Darwaja • Potteries • Shardaben Hospital',
    lat: 23.0315,
    lng: 72.6120,
    keywords: ['saraspur', 'shardaben hospital', 'saraspur darwaja', 'east']
  },
  {
    name: 'Gomtipur / Monogram Mills',
    shortName: 'Gomtipur',
    subtitle: 'Gomtipur Railway Crossing • Sukhramnagar',
    lat: 23.0145,
    lng: 72.6140,
    keywords: ['gomtipur', 'sukhramnagar', 'east']
  },
  {
    name: 'Khokhra / Anupam Cinema',
    shortName: 'Khokhra',
    subtitle: 'Anupam Cinema • Hatkeshwar Link • Gujarat Housing',
    lat: 22.9985,
    lng: 72.6170,
    keywords: ['khokhra', 'anupam cinema', 'east']
  },
  {
    name: 'Isanpur / Govindwadi Cross Road',
    shortName: 'Isanpur',
    subtitle: 'Govindwadi • Parasnagar • Vatva Canal',
    lat: 22.9785,
    lng: 72.6040,
    keywords: ['isanpur', 'govindwadi', 'south-east']
  },
  {
    name: 'Ghodasar / Smrutimandir',
    shortName: 'Ghodasar',
    subtitle: 'Smrutimandir • Cadila Bridge • Jasodanagar',
    lat: 22.9860,
    lng: 72.6060,
    keywords: ['ghodasar', 'smrutimandir', 'cadila bridge', 'south-east']
  },
  {
    name: 'Vatva / Vatva Industrial GIDC',
    shortName: 'Vatva GIDC',
    subtitle: 'Vatva Railway Station • GIDC Phase 1-4',
    lat: 22.9640,
    lng: 72.6320,
    keywords: ['vatva', 'vatva gidc', 'industrial estate', 'south-east']
  },
  {
    name: 'CTM / Express Highway Cross Road',
    shortName: 'CTM Express Highway',
    subtitle: 'National Expressway 1 • Vadodara Highway Hub',
    lat: 22.9890,
    lng: 72.6280,
    keywords: ['ctm', 'express highway', 'expressway', 'ctm cross road', 'vadodara expressway', 'south-east']
  },
  {
    name: 'Hatkeshwar / Jasodanagar Highway',
    shortName: 'Hatkeshwar',
    subtitle: 'Jasodanagar Cross Road • Express Toll Hub',
    lat: 22.9940,
    lng: 72.6250,
    keywords: ['hatkeshwar', 'jasodanagar', 'south-east']
  },

  // North Ahmedabad / Gandhinagar Corridor
  {
    name: 'SVP International Airport (SVPIA - T1/T2)',
    shortName: 'Airport (SVPIA)',
    subtitle: 'Hansol • Domestic & International Terminals',
    lat: 23.0734,
    lng: 72.6266,
    keywords: ['airport', 'svpia', 'hansol', 'terminal', 'flight', 'domestic airport', 'international airport', 'north']
  },
  {
    name: 'Narendra Modi Stadium / Motera',
    shortName: 'Motera Stadium',
    subtitle: 'Motera • Cricket Stadium • Sabarmati Metro',
    lat: 23.0915,
    lng: 72.5975,
    keywords: ['motera', 'stadium', 'narendra modi', 'narendra modi stadium', 'cricket stadium', 'sabarmati power', 'north']
  },
  {
    name: 'Sabarmati Railway Station (SBT)',
    shortName: 'Sabarmati Junction',
    subtitle: 'Dharmanagar • High Speed Bullet Train Terminal',
    lat: 23.0725,
    lng: 72.5820,
    keywords: ['sabarmati station', 'sabarmati junction', 'bullet train', 'sbt', 'dharmanagar', 'north']
  },
  {
    name: 'Chandkheda / Visat Gandhinagar Road',
    shortName: 'Chandkheda',
    subtitle: 'Visat Cross Road • ONGC • IIT Gandhinagar route',
    lat: 23.1095,
    lng: 72.5850,
    keywords: ['chandkheda', 'visat', 'ongc', 'visat petrol pump', 'zundal', 'north']
  },
  {
    name: 'Ranip / RTO Circle & AMTS Hub',
    shortName: 'Ranip (RTO)',
    subtitle: 'RTO Circle • Subhash Bridge • Central Bus Depot',
    lat: 23.0720,
    lng: 72.5690,
    keywords: ['ranip', 'rto', 'rto circle', 'amts hub', 'subhash bridge', 'north']
  },
  {
    name: 'New Ranip / GST Crossing',
    shortName: 'New Ranip',
    subtitle: 'GST Crossing • Chainpur • IOC Road',
    lat: 23.0890,
    lng: 72.5620,
    keywords: ['new ranip', 'gst crossing', 'chainpur', 'north']
  },
  {
    name: 'Tragad / Chenpur Road',
    shortName: 'Tragad',
    subtitle: 'Tragad • Nirma University Link • SP Ring Road',
    lat: 23.1160,
    lng: 72.5480,
    keywords: ['tragad', 'chenpur', 'nirma', 'north']
  },
  {
    name: 'Godrej Garden City / Jagatpur',
    shortName: 'Godrej Garden City',
    subtitle: 'Jagatpur • Gota-Tragad Road • Global City',
    lat: 23.1090,
    lng: 72.5440,
    keywords: ['godrej garden city', 'jagatpur', 'godrej', 'north']
  },
  {
    name: 'Vaishnodevi Circle / SG Highway',
    shortName: 'Vaishnodevi Circle',
    subtitle: 'Vaishnodevi Temple • KD Hospital • SP Ring Road Junction',
    lat: 23.1255,
    lng: 72.5410,
    keywords: ['vaishnodevi', 'vaishnodevi circle', 'kd hospital', 'sg highway north', 'north']
  },
  {
    name: 'Adalaj / Adalaj Stepwell (Trimandir)',
    shortName: 'Adalaj Stepwell',
    subtitle: 'Historic Adalaj Stepwell • Trimandir Highway',
    lat: 23.1665,
    lng: 72.5800,
    keywords: ['adalaj', 'adalaj stepwell', 'trimandir', 'stepwell', 'north']
  },
  {
    name: 'Zundal / Zundal Circle',
    shortName: 'Zundal',
    subtitle: 'Zundal Circle • SP Ring Road • Chandkheda Connector',
    lat: 23.1410,
    lng: 72.5680,
    keywords: ['zundal', 'zundal circle', 'sp ring road', 'north']
  },
  {
    name: 'GIFT City / Gandhinagar FinTech Hub',
    shortName: 'GIFT City',
    subtitle: 'Gandhinagar Metro Corridor • International Finance Tec-City',
    lat: 23.1598,
    lng: 72.6842,
    keywords: ['gift city', 'gift', 'gandhinagar', 'infocity', 'koba', 'pethapur', 'metro', 'north']
  },
  {
    name: 'Infocity / DA-IICT Gandhinagar',
    shortName: 'Infocity (Gandhinagar)',
    subtitle: 'Infocity IT Park • DA-IICT • GH-0 Circle',
    lat: 23.1950,
    lng: 72.6280,
    keywords: ['infocity', 'daiict', 'da-iict', 'tcs', 'gandhinagar it', 'north']
  },
  {
    name: 'Gandhinagar Capital (Sector 11)',
    shortName: 'Gandhinagar Capital',
    subtitle: 'Sector 11 • Mahatma Mandir • Akshardham Access',
    lat: 23.2230,
    lng: 72.6490,
    keywords: ['gandhinagar capital', 'sector 11', 'mahatma mandir', 'akshardham', 'north']
  },

  // Major Healthcare & Academic Hubs
  {
    name: 'Civil Hospital Asarwa (Asia’s Largest)',
    shortName: 'Civil Hospital (Asarwa)',
    subtitle: 'Asarwa • UN Mehta • Gujarat Cancer Society',
    lat: 23.0495,
    lng: 72.6015,
    keywords: ['civil hospital', 'asarwa', 'un mehta', 'cancer hospital', 'trauma center', 'central']
  },
  {
    name: 'Zydus Hospital (Thaltej SG Highway)',
    shortName: 'Zydus Hospital',
    subtitle: 'Thaltej • SG Highway • Super Specialty Healthcare',
    lat: 23.0585,
    lng: 72.5180,
    keywords: ['zydus', 'zydus hospital', 'thaltej zydus', 'west']
  },
  {
    name: 'KD Hospital (Vaishnodevi SG Highway)',
    shortName: 'KD Hospital',
    subtitle: 'Vaishnodevi Circle • Kusum Dhirajlal Multi-Specialty',
    lat: 23.1180,
    lng: 72.5420,
    keywords: ['kd hospital', 'vaishnodevi kd', 'kusum dhirajlal', 'north']
  },
  {
    name: 'Palladium Mall / Thaltej',
    shortName: 'Palladium Mall',
    subtitle: 'SBR Ext • Luxury Shopping & Entertainment',
    lat: 23.0560,
    lng: 72.5140,
    keywords: ['palladium', 'palladium mall', 'luxury mall', 'thaltej mall', 'west']
  },
  {
    name: 'IIM Ahmedabad (Heritage Campus)',
    shortName: 'IIM Ahmedabad',
    subtitle: 'Vastrapur • Indian Institute of Management',
    lat: 23.0325,
    lng: 72.5340,
    keywords: ['iim', 'iim ahmedabad', 'iima', 'vastrapur iim', 'west']
  },
  {
    name: 'Gujarat University / CEPT Campus',
    shortName: 'Gujarat University',
    subtitle: 'Navrangpura • LD Arts • CEPT University',
    lat: 23.0360,
    lng: 72.5470,
    keywords: ['gujarat university', 'cept', 'ld engineering', 'navrangpura campus', 'central']
  },
  {
    name: 'Karnavati Club / SG Highway',
    shortName: 'Karnavati Club',
    subtitle: 'SG Highway • Prahladnagar Cross Road',
    lat: 23.0140,
    lng: 72.5020,
    keywords: ['karnavati', 'karnavati club', 'sg highway club', 'west']
  },
  {
    name: 'Rajpath Club / SG Highway',
    shortName: 'Rajpath Club',
    subtitle: 'Bodakdev • SG Highway Junction',
    lat: 23.0390,
    lng: 72.5090,
    keywords: ['rajpath', 'rajpath club', 'bodakdev club', 'west']
  },
];

const LOCATION_PRESETS = AHMEDABAD_LOCATIONS;

const POPULAR_PICKUPS = [
  AHMEDABAD_LOCATIONS[0],  // SG Highway
  AHMEDABAD_LOCATIONS[1],  // Vastrapur Lake
  AHMEDABAD_LOCATIONS[47], // Airport (SVPIA)
  AHMEDABAD_LOCATIONS[29], // Kalupur Station
  AHMEDABAD_LOCATIONS[6],  // Prahlad Nagar
  AHMEDABAD_LOCATIONS[7],  // Bopal
];

const POPULAR_DESTINATIONS = [
  AHMEDABAD_LOCATIONS[23], // Riverfront
  AHMEDABAD_LOCATIONS[57], // GIFT City
  AHMEDABAD_LOCATIONS[48], // Motera Stadium
  AHMEDABAD_LOCATIONS[34], // Kankaria Lake
  AHMEDABAD_LOCATIONS[64], // Palladium Mall
  AHMEDABAD_LOCATIONS[47], // Airport (SVPIA)
];

const searchAhmedabadLocations = (query) => {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return AHMEDABAD_LOCATIONS.slice(0, 20);
  }
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(Boolean);
  
  return AHMEDABAD_LOCATIONS.filter(loc => {
    const haystack = `${loc.name} ${loc.shortName || ''} ${loc.subtitle || ''} ${(loc.keywords || []).join(' ')}`.toLowerCase();
    return haystack.includes(q) || tokens.every(t => haystack.includes(t));
  });
};

const resolveCoordinates = (addressText) => {
  if (!addressText || typeof addressText !== 'string') return null;
  const lower = addressText.toLowerCase().trim();
  if (!lower) return null;

  // 1. Exact match on full name or short name
  const exact = AHMEDABAD_LOCATIONS.find(
    loc => loc.name.toLowerCase() === lower || (loc.shortName && loc.shortName.toLowerCase() === lower)
  );
  if (exact) return { lat: exact.lat, lng: exact.lng, name: exact.name };

  // 2. Keyword or partial match
  const kwMatch = AHMEDABAD_LOCATIONS.find(loc => 
    loc.keywords.some(k => lower.includes(k) || k.includes(lower)) || 
    lower.includes(loc.name.toLowerCase()) || 
    loc.name.toLowerCase().includes(lower) ||
    (loc.shortName && (lower.includes(loc.shortName.toLowerCase()) || loc.shortName.toLowerCase().includes(lower)))
  );
  if (kwMatch) return { lat: kwMatch.lat, lng: kwMatch.lng, name: kwMatch.name };

  // 3. Fallback: deterministic offset in Ahmedabad municipal bounds
  if (lower.length >= 2) {
    let hash = 0;
    for (let i = 0; i < lower.length; i++) {
      hash = (hash << 5) - hash + lower.charCodeAt(i);
      hash |= 0;
    }
    const latOffset = ((Math.abs(hash) % 100) - 50) * 0.0012;
    const lngOffset = ((Math.abs(hash * 31) % 100) - 50) * 0.0012;
    return {
      lat: Number((23.0300 + latOffset).toFixed(4)),
      lng: Number((72.5600 + lngOffset).toFixed(4)),
      name: addressText
    };
  }
  return null;
};

const CarCityIllustration = () => (
  <div className="car-illustration-wrap" style={{ margin: '0.5rem auto 1rem auto', textAlign: 'center' }}>
    <svg width="220" height="90" viewBox="0 0 220 90" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block' }}>
      {/* Soft background clouds */}
      <ellipse cx="60" cy="22" rx="20" ry="7" fill="#E0F2FE" />
      <ellipse cx="160" cy="18" rx="24" ry="8" fill="#E0F2FE" />
      <ellipse cx="172" cy="15" rx="14" ry="6" fill="#F0F9FF" />

      {/* Modern cityscape silhouette */}
      <rect x="75" y="24" width="14" height="42" rx="2" fill="#E0F2FE" />
      <rect x="92" y="16" width="16" height="50" rx="2" fill="#BAE6FD" />
      <rect x="111" y="28" width="18" height="38" rx="2" fill="#E0F2FE" />
      <rect x="132" y="20" width="14" height="46" rx="2" fill="#BAE6FD" />

      {/* Trees */}
      <circle cx="50" cy="54" r="8" fill="#34D399" />
      <rect x="49" y="58" width="2" height="10" fill="#10B981" />
      <circle cx="168" cy="52" r="9" fill="#34D399" />
      <rect x="167" y="56" width="2" height="12" fill="#10B981" />

      {/* Road line */}
      <rect x="20" y="66" width="180" height="4" rx="2" fill="#CBD5E1" />

      {/* Car body */}
      <path d="M72 58 L82 48 Q85 45 92 45 L128 45 Q135 45 140 49 L148 58 L152 60 Q154 62 153 65 L67 65 Q66 62 68 60 Z" fill="#2563EB" />
      {/* Car windows */}
      <path d="M85 47 L94 47 L94 56 L77 56 Z" fill="#BFDBFE" />
      <path d="M97 47 L126 47 L126 56 L97 56 Z" fill="#BFDBFE" />
      <path d="M129 47 L137 50 L144 56 L129 56 Z" fill="#BFDBFE" />
      {/* Wheels */}
      <circle cx="86" cy="65" r="7" fill="#0F172A" />
      <circle cx="86" cy="65" r="3.5" fill="#E2E8F0" />
      <circle cx="134" cy="65" r="7" fill="#0F172A" />
      <circle cx="134" cy="65" r="3.5" fill="#E2E8F0" />
      {/* Headlight */}
      <path d="M68 59 L71 59 L71 62 L68 61 Z" fill="#FDE047" />
    </svg>
  </div>
);

const getPassengerAvatarConfig = (name = '', email = '') => {
  const cleanName = (name || '').trim();
  const firstName = cleanName.split(' ')[0].toLowerCase() || 'passenger';
  
  const femalePatterns = [
    'neha', 'priya', 'pooja', 'ananya', 'sneha', 'shreya', 'divya', 'riya', 'aisha', 
    'fatima', 'sarah', 'sara', 'emily', 'jessica', 'maya', 'kavita', 'sunita', 'meera', 
    'deepa', 'tanvi', 'aditi', 'ishita', 'anushka', 'radhika', 'swati', 'simran', 'komal',
    'puja', 'tanya', 'kiran', 'rachel', 'laura', 'sophia', 'emma', 'olivia', 'shruti', 'sonam'
  ];
  const maleExceptions = ['uday', 'ajay', 'vijay', 'sanjay', 'vinay', 'abhay', 'dhananjay'];

  let isFemale = femalePatterns.includes(firstName);
  if (!isFemale && !maleExceptions.includes(firstName)) {
    if (firstName.endsWith('a') && !['rishi', 'krishna', 'shiva'].includes(firstName)) {
      isFemale = true;
    } else if (firstName.endsWith('i') && !['ravi', 'ali', 'hari', 'rishi'].includes(firstName)) {
      isFemale = true;
    }
  }

  const rawKey = `${cleanName.toLowerCase()}_${(email || '').toLowerCase()}`;
  let hash = 5381;
  for (let i = 0; i < rawKey.length; i++) {
    hash = ((hash << 5) + hash) + rawKey.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  const bgThemes = [
    { id: 'sapphire', top: '#0F172A', mid: '#1E40AF', bottom: '#38BDF8', glow: '#60A5FA' },
    { id: 'ember', top: '#270A05', mid: '#9A3412', bottom: '#FB923C', glow: '#FDBA74' },
    { id: 'orchid', top: '#1E1035', mid: '#6D28D9', bottom: '#C084FC', glow: '#E879F9' },
    { id: 'emerald', top: '#06251E', mid: '#065F46', bottom: '#34D399', glow: '#6EE7B7' },
    { id: 'indigo', top: '#0B1329', mid: '#3730A3', bottom: '#818CF8', glow: '#A5B4FC' },
    { id: 'crimson', top: '#2A080C', mid: '#991B1B', bottom: '#FB7185', glow: '#FDA4AF' }
  ];
  const bgTheme = bgThemes[seed % bgThemes.length];

  const skinTones = [
    { skin: '#FCD34D', shadow: '#F59E0B', ears: '#FBBF24', neck: '#F59E0B' },
    { skin: '#FDBA74', shadow: '#EA580C', ears: '#FB923C', neck: '#FB923C' },
    { skin: '#E0A96D', shadow: '#C27838', ears: '#D28E58', neck: '#C67C48' },
    { skin: '#B45309', shadow: '#78350F', ears: '#9A3412', neck: '#92400E' }
  ];
  const skin = skinTones[(seed >> 2) % skinTones.length];

  const hairColors = [
    { main: '#18181B', highlight: '#3F3F46' },
    { main: '#292524', highlight: '#57534E' },
    { main: '#451A03', highlight: '#78350F' },
    { main: '#78350F', highlight: '#B45309' }
  ];
  const hairColor = hairColors[(seed >> 4) % hairColors.length];

  const outfitPalettes = [
    { base: '#1E3A8A', accent: '#3B82F6', inner: '#FFFFFF' },
    { base: '#065F46', accent: '#10B981', inner: '#ECFDF5' },
    { base: '#7C2D12', accent: '#EA580C', inner: '#FFF7ED' },
    { base: '#334155', accent: '#64748B', inner: '#F1F5F9' },
    { base: '#581C87', accent: '#9333EA', inner: '#FAF5FF' },
    { base: '#831843', accent: '#E11D48', inner: '#FFF1F2' }
  ];
  const outfitColor = outfitPalettes[(seed >> 6) % outfitPalettes.length];
  const outfitStyle = (seed >> 8) % 4;
  const hairStyle = (seed >> 10) % 4;
  const eyeStyle = (seed >> 12) % 4;
  const facialHair = (seed >> 14) % 4;
  const accessory = (seed >> 16) % 4;

  return {
    seed,
    isFemale,
    bgTheme,
    skin,
    hairColor,
    outfitColor,
    outfitStyle,
    hairStyle,
    eyeStyle,
    facialHair,
    accessory
  };
};

const PassengerDynamicAvatar = ({ name, email }) => {
  const config = getPassengerAvatarConfig(name, email);
  const {
    seed,
    isFemale,
    bgTheme,
    skin,
    hairColor,
    outfitColor,
    outfitStyle,
    hairStyle,
    eyeStyle,
    facialHair,
    accessory
  } = config;

  const clipId = `avatarClip_${seed}`;
  const gradId = `avatarBgGrad_${seed}`;

  return (
    <div className="passenger-avatar-svg-container">
      <svg 
        viewBox="0 0 140 140" 
        className="passenger-avatar-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="70" cy="70" r="62" />
          </clipPath>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={bgTheme.top} />
            <stop offset="50%" stopColor={bgTheme.mid} />
            <stop offset="100%" stopColor={bgTheme.bottom} />
          </linearGradient>
        </defs>

        {/* Character Portrait masked to circular avatar */}
        <g clipPath={`url(#${clipId})`}>
          {/* Vibrant Gradient Background */}
          <rect width="140" height="140" fill={`url(#${gradId})`} />

          {/* Studio Ambient Glow */}
          <ellipse cx="70" cy="40" rx="42" ry="26" fill={bgTheme.glow} opacity="0.25" />

          {/* Female Back Hair Layer */}
          {isFemale && hairStyle === 0 && (
            <path d="M34 50 C28 80 38 120 48 135 L92 135 C102 120 112 80 106 50 Z" fill={hairColor.main} />
          )}
          {isFemale && hairStyle === 2 && (
            <g>
              <circle cx="70" cy="18" r="14" fill={hairColor.main} />
              <ellipse cx="70" cy="17" rx="10" ry="7" fill={hairColor.highlight} opacity="0.6" />
            </g>
          )}
          {isFemale && hairStyle === 3 && (
            <path d="M30 52 C24 82 34 125 48 135 L92 135 C106 125 116 82 110 52 Z" fill={hairColor.main} />
          )}

          {/* Bobbing Character Body */}
          <g className="anim-char-bob">
            {/* Outfits: Base shoulders */}
            <path d="M26 135 C26 98 48 92 70 92 C92 92 114 98 114 135 Z" fill={outfitColor.base} />

            {/* Outfit Style Variations */}
            {outfitStyle === 0 && (
              <g>
                <path d="M56 92 Q70 102 84 92" stroke={outfitColor.inner} strokeWidth="3.5" fill="none" />
                <line x1="70" y1="94" x2="70" y2="135" stroke={outfitColor.accent} strokeWidth="2.5" />
                <path d="M46 96 L58 135 H36 Z" fill={outfitColor.accent} opacity="0.5" />
                <path d="M94 96 L82 135 H104 Z" fill={outfitColor.accent} opacity="0.5" />
              </g>
            )}
            {outfitStyle === 1 && (
              <g>
                <path d="M58 92 L70 112 L82 92 Z" fill={outfitColor.accent} />
                <line x1="66" y1="102" x2="66" y2="122" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="74" y1="102" x2="74" y2="122" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}
            {outfitStyle === 2 && (
              <g>
                <path d="M56 92 L70 116 L84 92 Z" fill={outfitColor.inner} />
                <path d="M44 96 L60 135 H34 Z" fill={outfitColor.accent} />
                <path d="M96 96 L80 135 H106 Z" fill={outfitColor.accent} />
              </g>
            )}
            {outfitStyle === 3 && (
              <g>
                <path d="M54 92 L70 100 L86 92 L78 87 L62 87 Z" fill={outfitColor.accent} />
                <line x1="70" y1="98" x2="70" y2="135" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2 3" />
                <line x1="42" y1="108" x2="56" y2="108" stroke={outfitColor.accent} strokeWidth="2" strokeLinecap="round" />
                <line x1="84" y1="108" x2="98" y2="108" stroke={outfitColor.accent} strokeWidth="2" strokeLinecap="round" />
              </g>
            )}

            {/* Neck */}
            <rect x="62" y="74" width="16" height="20" rx="3" fill={skin.neck} />
            <path d="M62 82 Q70 88 78 82" stroke={skin.shadow} strokeWidth="1.5" fill="none" opacity="0.35" />

            {/* Necklace if equipped */}
            {(accessory === 2 || accessory === 3) && (
              <g>
                <path d="M63 88 Q70 96 77 88" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
                <circle cx="70" cy="96" r="2.5" fill="#F59E0B" />
              </g>
            )}

            {/* Ears */}
            <circle cx="47" cy="58" r="6" fill={skin.ears} />
            <circle cx="93" cy="58" r="6" fill={skin.ears} />

            {/* Earrings / Stud if equipped */}
            {isFemale && (accessory === 1 || accessory === 3) && (
              <g>
                <circle cx="46" cy="64" r="3" stroke="#F59E0B" strokeWidth="1.5" fill="none" className="anim-earring" />
                <circle cx="94" cy="64" r="3" stroke="#F59E0B" strokeWidth="1.5" fill="none" className="anim-earring" />
              </g>
            )}
            {!isFemale && (accessory === 1 || accessory === 3) && (
              <circle cx="46" cy="60" r="1.5" fill="#E2E8F0" />
            )}

            {/* Face */}
            <path d="M48 50 C48 76 60 88 70 88 C80 88 92 76 92 50 C92 36 82 30 70 30 C58 30 48 36 48 50 Z" fill={skin.skin} />

            {/* Nose */}
            <path d="M68 62 L70 66 L73 66" stroke={skin.shadow} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7" />

            {/* Mouth / Smile */}
            <path d="M64 74 Q70 78 76 74" stroke={isFemale ? "#BE123C" : skin.shadow} strokeWidth={isFemale ? "2.5" : "2"} strokeLinecap="round" fill="none" />

            {/* Facial Hair (Male only) */}
            {!isFemale && facialHair === 1 && (
              <path d="M52 68 Q70 92 88 68 Q70 86 52 68 Z" fill={hairColor.main} opacity="0.18" />
            )}
            {!isFemale && facialHair === 2 && (
              <g>
                <path d="M50 64 C50 82 60 90 70 90 C80 90 90 82 90 64 C90 74 82 84 70 84 C58 84 50 74 50 64 Z" fill={hairColor.main} />
                <path d="M63 71 Q70 73 77 71 Q70 69 63 71" fill={hairColor.main} />
              </g>
            )}
            {!isFemale && facialHair === 3 && (
              <g>
                <ellipse cx="70" cy="81" rx="8" ry="6" fill={hairColor.main} />
                <ellipse cx="70" cy="79" rx="5" ry="3" fill={skin.skin} />
                <path d="M64 71 Q70 73 76 71" stroke={hairColor.main} strokeWidth="2" strokeLinecap="round" fill="none" />
              </g>
            )}

            {/* Eyes & Eyewear Variations */}
            {eyeStyle === 0 && (
              <g>
                <circle cx="58" cy="54" r="9.5" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
                <circle cx="82" cy="54" r="9.5" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
                <path d="M67.5 52 Q70 50 72.5 52" stroke="#334155" strokeWidth="2" strokeLinecap="round" fill="none" />
                <path d="M52 50 L57 46" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" className="anim-glare" />
                <path d="M76 50 L81 46" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" className="anim-glare" />
              </g>
            )}
            {eyeStyle === 1 && (
              <g>
                <rect x="49" y="47" width="18" height="15" rx="4" fill="#09090B" stroke="#475569" strokeWidth="1.5" />
                <rect x="73" y="47" width="18" height="15" rx="4" fill="#09090B" stroke="#475569" strokeWidth="1.5" />
                <line x1="67" y1="51" x2="73" y2="51" stroke="#475569" strokeWidth="2" />
                <line x1="52" y1="50" x2="58" y2="47" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" className="anim-glare" />
                <line x1="76" y1="50" x2="82" y2="47" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" className="anim-glare" />
              </g>
            )}
            {eyeStyle === 2 && (
              <g>
                <ellipse cx="58" cy="54" rx="4.5" ry="3.5" fill="#FFFFFF" />
                <circle cx="58" cy="54" r="2.2" fill="#1E293B" />
                <circle cx="57" cy="53" r="0.8" fill="#FFFFFF" />
                <ellipse cx="82" cy="54" rx="4.5" ry="3.5" fill="#FFFFFF" />
                <circle cx="82" cy="54" r="2.2" fill="#1E293B" />
                <circle cx="81" cy="53" r="0.8" fill="#FFFFFF" />
                <circle cx="58" cy="54" r="10" fill="rgba(255,255,255,0.12)" stroke="#94A3B8" strokeWidth="1.5" />
                <circle cx="82" cy="54" r="10" fill="rgba(255,255,255,0.12)" stroke="#94A3B8" strokeWidth="1.5" />
                <path d="M68 53 Q70 51 72 53" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M53 49 L58 45" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" strokeLinecap="round" className="anim-glare" />
                <path d="M77 49 L82 45" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" strokeLinecap="round" className="anim-glare" />
              </g>
            )}
            {eyeStyle === 3 && (
              <g>
                <path d="M52 46 Q58 43 64 46" stroke={hairColor.main} strokeWidth="2" strokeLinecap="round" fill="none" />
                <path d="M76 46 Q82 43 88 46" stroke={hairColor.main} strokeWidth="2" strokeLinecap="round" fill="none" />
                <g className="anim-blink">
                  <ellipse cx="58" cy="54" rx="5" ry="3.5" fill="#FFFFFF" />
                  <circle cx="58" cy="54" r="2.5" fill="#0F172A" />
                  <circle cx="57" cy="53" r="1" fill="#FFFFFF" />
                  {isFemale && <path d="M53 53 Q58 49 63 53" stroke="#0F172A" strokeWidth="1.5" fill="none" />}
                  <ellipse cx="82" cy="54" rx="5" ry="3.5" fill="#FFFFFF" />
                  <circle cx="82" cy="54" r="2.5" fill="#0F172A" />
                  <circle cx="81" cy="53" r="1" fill="#FFFFFF" />
                  {isFemale && <path d="M77 53 Q82 49 87 53" stroke="#0F172A" strokeWidth="1.5" fill="none" />}
                </g>
              </g>
            )}

            {/* Front Hairstyles */}
            {!isFemale && hairStyle === 0 && (
              <g>
                <path d="M44 48 C40 34 50 16 70 16 C90 16 100 34 96 48 C92 38 86 28 70 28 C54 28 48 38 44 48 Z" fill={hairColor.main} />
                <path d="M52 24 C60 18 80 18 88 24 C82 19 72 17 62 21 Z" fill={hairColor.highlight} />
              </g>
            )}
            {!isFemale && hairStyle === 1 && (
              <g>
                <path d="M46 48 C44 38 52 24 70 24 C88 24 96 38 94 48 C91 38 86 32 70 32 C54 32 49 38 46 48 Z" fill={hairColor.main} />
                <path d="M46 44 L44 54 L48 54 Z" fill={hairColor.main} />
                <path d="M94 44 L96 54 L92 54 Z" fill={hairColor.main} />
              </g>
            )}
            {!isFemale && hairStyle === 2 && (
              <g>
                <circle cx="54" cy="28" r="9" fill={hairColor.main} />
                <circle cx="68" cy="24" r="10" fill={hairColor.main} />
                <circle cx="84" cy="27" r="9" fill={hairColor.main} />
                <circle cx="60" cy="22" r="7" fill={hairColor.highlight} />
                <circle cx="76" cy="22" r="7" fill={hairColor.highlight} />
                <path d="M46 48 C44 38 50 32 60 30 C70 30 76 34 84 32 C92 32 96 38 94 48 C90 40 84 36 70 36 C56 36 50 40 46 48 Z" fill={hairColor.main} />
              </g>
            )}
            {!isFemale && hairStyle === 3 && (
              <g>
                <path d="M44 48 C42 36 52 22 72 22 C88 22 96 34 96 48 C92 38 84 30 70 30 C56 30 48 38 44 48 Z" fill={hairColor.main} />
                <line x1="58" y1="26" x2="63" y2="35" stroke={hairColor.highlight} strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}

            {isFemale && hairStyle === 0 && (
              <g>
                <path d="M44 44 C40 26 54 18 70 18 C86 18 100 26 96 44 C92 34 86 28 70 28 C54 28 48 34 44 44 Z" fill={hairColor.main} />
                <path d="M46 36 C41 54 43 82 48 94 C46 76 49 52 54 42 Z" fill={hairColor.main} />
                <path d="M94 36 C99 54 97 82 92 94 C94 76 91 52 86 42 Z" fill={hairColor.main} />
                <path d="M52 24 C62 18 78 18 88 24" stroke={hairColor.highlight} strokeWidth="2" strokeLinecap="round" fill="none" />
              </g>
            )}
            {isFemale && hairStyle === 1 && (
              <g>
                <path d="M44 44 C42 26 54 18 70 18 C86 18 98 26 96 44 C92 34 86 28 70 28 C54 28 48 34 44 44 Z" fill={hairColor.main} />
                <path d="M44 38 C42 54 44 68 50 74 C47 64 47 50 51 40 Z" fill={hairColor.main} />
                <path d="M96 38 C98 54 96 68 90 74 C93 64 93 50 89 40 Z" fill={hairColor.main} />
              </g>
            )}
            {isFemale && hairStyle === 2 && (
              <g>
                <path d="M45 44 C44 30 54 24 70 24 C86 24 96 30 95 44 C91 35 84 31 70 31 C56 31 49 35 45 44 Z" fill={hairColor.main} />
                <path d="M47 44 Q45 56 47 62" stroke={hairColor.main} strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M93 44 Q95 56 93 62" stroke={hairColor.main} strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </g>
            )}
            {isFemale && hairStyle === 3 && (
              <g>
                <path d="M42 46 C38 28 52 18 70 18 C88 18 102 28 98 46 C94 36 88 28 70 28 C52 28 46 36 42 46 Z" fill={hairColor.main} />
                <circle cx="44" cy="56" r="6" fill={hairColor.main} />
                <circle cx="46" cy="68" r="6" fill={hairColor.main} />
                <circle cx="96" cy="56" r="6" fill={hairColor.main} />
                <circle cx="94" cy="68" r="6" fill={hairColor.main} />
              </g>
            )}
          </g>
        </g>

        {/* Clean circular border rim (NO yellow slider, NO rating badge) */}
        <circle 
          cx="70" 
          cy="70" 
          r="62" 
          fill="none" 
          stroke="rgba(255, 255, 255, 0.35)" 
          strokeWidth="3" 
        />
      </svg>
    </div>
  );
};

const PassengerPortal = () => {
  const { user, switchPassenger } = useAuth();
  const [profile, setProfile] = useState(null);
  const [rides, setRides] = useState([]);
  const [showAllRides, setShowAllRides] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [liveDriverLocation, setLiveDriverLocation] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [surgeMultiplier, setSurgeMultiplier] = useState(1.0);

  // Tracking refs to eliminate spamming and guarantee clean dismissal
  const activeRideRef = useRef(null);
  const notifiedRidesRef = useRef(new Set());
  const timerRef = useRef(null);
  const profileRef = useRef(null);
  const userRef = useRef(null);

  // Completed Ride & Driver Rating Modal State
  const [completedRideModal, setCompletedRideModal] = useState(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState(false);
  const [updatedDriverRating, setUpdatedDriverRating] = useState(null);
  const completedNotifiedRef = useRef(new Set());

  // In-Ride Emergency SOS State
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosIncident, setSosIncident] = useState(null);
  const [rescueDispatched, setRescueDispatched] = useState(null);
  const [rescueLoading, setRescueLoading] = useState(false);
  const autoRescueTriggeredRef = useRef(false);

  // In-Ride Emergency SOS Trigger Handler
  const handleTriggerSos = async () => {
    if (!activeRide) return;
    setSosLoading(true);
    setError(null);
    try {
      const curLat = liveDriverLocation?.latitude || activeRide.pickup_latitude || 23.0233;
      const curLng = liveDriverLocation?.longitude || activeRide.pickup_longitude || 72.6006;
      const res = await apiClient.post('/sos/trigger', {
        ride_id: activeRide.id,
        passenger_id: profile?.id || user?.id,
        lat: curLat,
        lng: curLng,
      });

      if (res.data?.success) {
        setSosActive(true);
        const inc = res.data.data?.incident || res.data.data;
        setSosIncident(inc);
        setShowSosModal(false);
        const rescueData = res.data.data;
        if (rescueData?.rescue_ride) {
          const rescueRide = rescueData.rescue_ride;
          const assignedDriverName = rescueData.driver_assigned?.name || rescueRide.driver_name;
          setMessage(`🚨 Emergency SOS alert activated! Driver terminated. Free rescue cab dispatched: ${assignedDriverName ? assignedDriverName + ' assigned to your location.' : 'allocating nearest driver.'}`);
          setSavedRideId(rescueRide.id);
          setActiveRide(rescueRide);
        } else {
          setMessage('🚨 Emergency SOS alert activated! Operations Admin and authorities notified. Live location tracking active.');
        }
        await loadData();
      } else {
        setError(res.data?.message || 'Failed to trigger SOS alert.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to trigger SOS alert.');
    } finally {
      setSosLoading(false);
    }
  };

  // Live GPS Telemetry Stream when SOS is Active
  useEffect(() => {
    if (!sosActive || !sosIncident?.incident_id) return;

    const streamInterval = setInterval(() => {
      const lat = liveDriverLocation?.latitude || activeRide?.pickup_latitude || 23.0233;
      const lng = liveDriverLocation?.longitude || activeRide?.pickup_longitude || 72.6006;

      emitPassengerSosLocation({
        incidentId: sosIncident.incident_id,
        rideId: activeRide?.id,
        lat,
        lng,
      });

      apiClient.post(`/sos/${sosIncident.incident_id}/location`, { lat, lng }).catch(() => {});
    }, 3500);

    return () => clearInterval(streamInterval);
  }, [sosActive, sosIncident?.incident_id, liveDriverLocation?.latitude, liveDriverLocation?.longitude, activeRide?.id]);

  // Subscribe to Rescue Cab Dispatched Notification (strictly scoped to THIS passenger)
  useEffect(() => {
    const unsubRescue = onSosRescueDispatched((data) => {
      const myPassId = profileRef.current?.id;
      const myUserId = userRef.current?.id;
      const newRide = data?.rescue_ride || data?.ride;
      const eventPassId = data?.passenger_id || newRide?.passenger_id;
      const eventUserId = data?.passenger_user_id || data?.user_id;

      const isMyRescue = (
        (myPassId && eventPassId === myPassId) ||
        (myUserId && (eventPassId === myUserId || eventUserId === myUserId))
      );

      // Ignore notifications belonging to any other passenger
      if (!isMyRescue) {
        return;
      }

      console.log('Free rescue cab dispatched:', data);
      setRescueDispatched(data);
      const newRideId = data?.rescue_ride_id || data?.rescueRideId || newRide?.id;
      if (newRideId) {
        setSavedRideId(newRideId);
      }
      if (newRide) {
        setActiveRide(newRide);
      }
      setMessage(`Rescue cab dispatched: ${newRide?.driver_name || data?.driver?.name || 'Nearest Driver'} is on the way! ₹0.00 fare.`);
      loadData();
    });

    return () => unsubRescue();
  }, []);

  // Handler to manually or automatically request nearest rescue driver allocation
  const handleRequestNearestRescue = async () => {
    if (!activeRide) return;
    setRescueLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiClient.post('/sos/request-rescue', {
        ride_id: activeRide.id,
        passenger_id: profile?.id || user?.id,
        lat: liveDriverLocation?.latitude || activeRide.pickup_latitude,
        lng: liveDriverLocation?.longitude || activeRide.pickup_longitude,
      });

      if (res.data?.success) {
        const rescueData = res.data.data;
        const newRide = rescueData.rescue_ride;
        const driverName = rescueData.driver?.name || newRide?.driver_name || 'Nearest Driver';
        setMessage(`Free rescue cab allocated! Driver ${driverName} assigned to your location.`);
        if (newRide?.id) {
          setSavedRideId(newRide.id);
          setActiveRide(newRide);
        }
        await loadData();
      } else {
        setError(res.data?.message || 'Failed to allocate nearest rescue driver.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error requesting rescue driver');
    } finally {
      setRescueLoading(false);
    }
  };

  // Automatically request & allocate nearest rescue driver whenever an active ride enters ABORTED_SOS
  useEffect(() => {
    if (activeRide?.status === 'ABORTED_SOS' && autoRescueTriggeredRef.current !== activeRide.id && !rescueLoading) {
      autoRescueTriggeredRef.current = activeRide.id;
      handleRequestNearestRescue();
    }
  }, [activeRide?.id, activeRide?.status]);

  const triggerRideCompletedModal = (rideInfo) => {
    if (!rideInfo) return;
    setCompletedRideModal(rideInfo);
    setRatingScore(5);
    setRatingHover(0);
    setRatingFeedback('');
    setRatingSubmitting(false);
    setRatingSuccess(false);
    setUpdatedDriverRating(null);
  };

  const handleSubmitDriverRating = async () => {
    if (!completedRideModal || ratingSubmitting) return;
    const driverId = completedRideModal.driver_id;
    if (!driverId) {
      setRatingSuccess(true);
      return;
    }

    setRatingSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post(`/drivers/${driverId}/rate`, {
        rating: ratingScore,
        comment: ratingFeedback,
        ride_id: completedRideModal.id
      });

      if (res.data?.success) {
        setRatingSuccess(true);
        const newR = res.data.data?.rating;
        if (newR) {
          setUpdatedDriverRating(newR);
        }
        await loadData();
      } else {
        setError(res.data?.message || 'Failed to submit rating');
      }
    } catch (err) {
      console.error('Driver rating error, attempting fallback route:', err);
      try {
        const fallbackRes = await apiClient.post(`/rides/${completedRideModal.id}/rate`, {
          rating: ratingScore,
          comment: ratingFeedback,
          driver_id: driverId
        });
        if (fallbackRes.data?.success) {
          setRatingSuccess(true);
          setUpdatedDriverRating(fallbackRes.data.data?.rating || ratingScore.toFixed(2));
          await loadData();
          return;
        }
      } catch (e) {}
      setError(err.response?.data?.message || err.message || 'Failed to submit driver rating');
    } finally {
      setRatingSubmitting(false);
    }
  };

  // No Drivers Available State (Stays on screen for 1 minute in red unless dismissed)
  const [noDriverAlert, setNoDriverAlert] = useState(false);
  const [showNoDriverModal, setShowNoDriverModal] = useState(false);
  const [alertCountdown, setAlertCountdown] = useState(60);
  const [cancelledRideInfo, setCancelledRideInfo] = useState(null);
  const [noDriverReason, setNoDriverReason] = useState('All nearby drivers have declined or are currently busy. Your ride request has been automatically cancelled.');
  const [retryingDispatch, setRetryingDispatch] = useState(false);

  // Clean, definitive dismissal handler for both Modal and Banner
  const dismissAllNoDriverAlerts = () => {
    setShowNoDriverModal(false);
    setNoDriverAlert(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rId = activeRide?.id || cancelledRideInfo?.id || activeRideRef.current;
    if (rId) {
      notifiedRidesRef.current.add(rId);
    }
  };

  const triggerNoDriverAlert = (rideInfo) => {
    const rId = rideInfo?.id || rideInfo?.rideId;
    if (rId) {
      notifiedRidesRef.current.add(rId);
    }
    setCancelledRideInfo(rideInfo);
    setNoDriverAlert(true);
    setShowNoDriverModal(true);
    setAlertCountdown(60);
    setMessage(null);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setAlertCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setShowNoDriverModal(false);
          setNoDriverAlert(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cleanup countdown timer on component unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Booking Form State
  const [pickupPreset, setPickupPreset] = useState(LOCATION_PRESETS[0].name);
  const [pickupAddress, setPickupAddress] = useState(LOCATION_PRESETS[0].name);
  const [pickupLat, setPickupLat] = useState(LOCATION_PRESETS[0].lat);
  const [pickupLng, setPickupLng] = useState(LOCATION_PRESETS[0].lng);

  const [destPreset, setDestPreset] = useState(LOCATION_PRESETS[3].name);
  const [destAddress, setDestAddress] = useState(LOCATION_PRESETS[3].name);
  const [destLat, setDestLat] = useState(LOCATION_PRESETS[3].lat);
  const [destLng, setDestLng] = useState(LOCATION_PRESETS[3].lng);

  // Autocomplete Search State for manual location typing
  const [pickupSearchOpen, setPickupSearchOpen] = useState(false);
  const [destSearchOpen, setDestSearchOpen] = useState(false);
  const pickupDropdownRef = useRef(null);
  const destDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickupDropdownRef.current && !pickupDropdownRef.current.contains(e.target)) {
        setPickupSearchOpen(false);
      }
      if (destDropdownRef.current && !destDropdownRef.current.contains(e.target)) {
        setDestSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fare estimation calculation based on Haversine distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  };

  const estimatedDistance = calculateDistance(pickupLat, pickupLng, destLat, destLng);
  const estimatedFare = Number(((50 + estimatedDistance * 18.5) * surgeMultiplier).toFixed(2));

  // Scoped storage key for active ride tracking (strictly isolated per user/passenger account)
  const getActiveRideKey = (uid) => {
    const id = uid || user?.id || profile?.id;
    return id ? `rideflow_passenger_active_ride_id_${id}` : null;
  };
  const getSavedRideId = () => {
    if (activeRideRef.current) return activeRideRef.current;
    const key = getActiveRideKey();
    if (!key) return null;
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  };
  const setSavedRideId = (id) => {
    activeRideRef.current = id;
    const key = getActiveRideKey();
    if (key) {
      if (id) {
        sessionStorage.setItem(key, id);
        localStorage.setItem(key, id);
      } else {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      }
    }
    sessionStorage.removeItem('rideflow_passenger_active_ride_id_anon');
    localStorage.removeItem('rideflow_passenger_active_ride_id_anon');
    localStorage.removeItem('rideflow_passenger_active_ride_id');
  };
  const clearSavedRideId = () => {
    activeRideRef.current = null;
    const key = getActiveRideKey();
    if (key) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
    sessionStorage.removeItem('rideflow_passenger_active_ride_id_anon');
    localStorage.removeItem('rideflow_passenger_active_ride_id_anon');
    localStorage.removeItem('rideflow_passenger_active_ride_id');
  };

  // Helper to accurately identify the active ride in progress strictly belonging to THIS passenger
  const resolveActiveRide = (allRides, myPassId) => {
    if (!Array.isArray(allRides) || allRides.length === 0) return null;

    const myUserId = user?.id;
    const isOwner = (r) => (
      (myPassId && r.passenger_id === myPassId) ||
      (myUserId && r.passenger_id === myUserId)
    );

    const passengerRides = allRides.filter(isOwner);
    if (passengerRides.length === 0) return null;

    // Sort strictly by created_at descending (newest first)
    const sortedRides = [...passengerRides].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );

    const newestRide = sortedRides[0];
    if (!newestRide) return null;

    const ACTIVE_STATUSES = [
      'REQUESTED',
      'PENDING',
      'DRIVER_ASSIGNED',
      'DRIVER_ACCEPTED',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
      'RESCUE_RIDE'
    ];

    // 1. If newest ride is active, show it immediately
    if (ACTIVE_STATUSES.includes(newestRide.status)) {
      setSavedRideId(newestRide.id);
      return newestRide;
    }

    // 2. If newest ride is an aborted SOS ride, check if an active rescue ride was dispatched for it
    if (newestRide.status === 'ABORTED_SOS') {
      const activeRescue = sortedRides.find(
        r => r.is_free_rescue && ACTIVE_STATUSES.includes(r.status)
      );
      if (activeRescue) {
        setSavedRideId(activeRescue.id);
        return activeRescue;
      }
      // Check if rescue ride was already completed
      const completedRescue = sortedRides.find(
        r => r.is_free_rescue && r.status === 'COMPLETED' && new Date(r.created_at) >= new Date(newestRide.created_at)
      );
      if (completedRescue) {
        clearSavedRideId();
        return null;
      }
      return newestRide;
    }

    // 3. If newest ride is COMPLETED or CANCELLED, there is no active ride!
    if (['COMPLETED', 'CANCELLED'].includes(newestRide.status)) {
      clearSavedRideId();
      return null;
    }

    clearSavedRideId();
    return null;
  };

  // Load profile and rides
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch profile
      let currentProf = null;
      const profRes = await apiClient.get('/passengers/profile', {
        params: user?.id ? { user_id: user.id } : {}
      });
      if (profRes.data.success) {
        currentProf = profRes.data.data;
        setProfile(currentProf);
      }

      const myPassId = currentProf?.id;
      const myUserId = user?.id;

      // Fetch active dynamic surge multiplier
      try {
        const surgeRes = await apiClient.get('/rides/pricing/surge');
        if (surgeRes.data?.success && surgeRes.data.data?.multiplier) {
          setSurgeMultiplier(parseFloat(surgeRes.data.data.multiplier));
        }
      } catch (e) {}

      // Fetch rides filtered specifically for this passenger
      const ridesRes = await apiClient.get('/rides', {
        params: myPassId ? { passenger_id: myPassId } : (myUserId ? { passenger_id: myUserId } : {})
      });
      if (ridesRes.data.success) {
        const rawRides = ridesRes.data.data || [];
        // Strict passenger isolation filter: NEVER leak rawRides of other passengers!
        const myRides = (myPassId || myUserId)
          ? rawRides.filter(r => (myPassId && r.passenger_id === myPassId) || (myUserId && r.passenger_id === myUserId))
          : [];
        setRides(myRides);

        // Identify current active ride for this passenger
        const currentActive = resolveActiveRide(myRides, myPassId);
        setActiveRide(currentActive || null);
        if (currentActive) {
          setSavedRideId(currentActive.id);
        } else {
          clearSavedRideId();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error loading passenger data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    activeRideRef.current = null;
    setActiveRide(null);
    setMessage(null);
    setError(null);
    setSosActive(false);
    setSosIncident(null);
    setRescueDispatched(null);
    loadData();
  }, [user?.id]);

  // Automatic Polling to guarantee instant portal-to-portal synchronization for THIS passenger
  useEffect(() => {
    const myPassId = profile?.id;
    const myUserId = user?.id;

    if (!myPassId && !myUserId) return;

    const pollInterval = setInterval(() => {
      apiClient.get('/rides', {
        params: myPassId ? { passenger_id: myPassId } : { passenger_id: myUserId }
      }).then(ridesRes => {
        if (ridesRes.data?.success) {
          const rawRides = ridesRes.data.data || [];
          const myRides = rawRides.filter(r => (myPassId && r.passenger_id === myPassId) || (myUserId && r.passenger_id === myUserId));
          setRides(myRides);

          const currentActive = resolveActiveRide(myRides, myPassId);
          setActiveRide(currentActive || null);
          if (currentActive) {
            setSavedRideId(currentActive.id);
          }

          // Check if actively tracked ride is COMPLETED or CANCELLED
          const trackedId = getSavedRideId();
          if (trackedId) {
            const tracked = myRides.find(r => r.id === trackedId);
            if (tracked && tracked.status === 'COMPLETED') {
              if (!completedNotifiedRef.current.has(tracked.id)) {
                completedNotifiedRef.current.add(tracked.id);
                triggerRideCompletedModal(tracked);
              }
              clearSavedRideId();
              setActiveRide(null);
            } else if (tracked && tracked.status === 'CANCELLED') {
              if (tracked.cancellation_reason?.includes('NO_DRIVERS') || tracked.cancellation_reason?.includes('DRIVERS_BUSY')) {
                if (!notifiedRidesRef.current.has(tracked.id)) {
                  notifiedRidesRef.current.add(tracked.id);
                  triggerNoDriverAlert(tracked);
                }
              }
              clearSavedRideId();
              setActiveRide(null);
            }
          }
        }
      }).catch(() => {});
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [profile?.id, user?.id]);

  // Keep refs up-to-date to prevent stale closures in Socket.IO and interval callbacks
  useEffect(() => {
    profileRef.current = profile;
    userRef.current = user;
  }, [profile, user]);

  // Socket.IO Real-time Channels integration
  useEffect(() => {
    const s = getSocket();
    if (s) {
      setSocketConnected(s.connected);
      const onConn = () => setSocketConnected(true);
      const onDis = () => setSocketConnected(false);
      s.on('connect', onConn);
      s.on('disconnect', onDis);

      const unsubStatus = onRideStatusChanged((data) => {
        if (data) {
          console.log('⚡ Realtime ride status received via Socket.IO:', data.status);
          const rId = data.rideId || data.ride?.id;
          const currentTrackedId = getSavedRideId();
          const rideObj = data.ride || (data.rideId ? { id: data.rideId, ...data } : null);

          const myPassId = profileRef.current?.id;
          const myUserId = userRef.current?.id;

          // Strictly verify event belongs to this logged-in passenger
          const isMyRide = rideObj && (
            (myPassId && rideObj.passenger_id === myPassId) ||
            (myUserId && rideObj.passenger_id === myUserId)
          );

          // If foreign ride, IGNORE completely!
          if (!isMyRide && (!currentTrackedId || rId !== currentTrackedId)) {
            return;
          }

          if (data.status === 'COMPLETED' || rideObj?.status === 'COMPLETED') {
            if (rId && (isMyRide || currentTrackedId === rId)) {
              if (!completedNotifiedRef.current.has(rId)) {
                completedNotifiedRef.current.add(rId);
                triggerRideCompletedModal(rideObj || activeRide || { id: rId });
              }
              setActiveRide(null);
              clearSavedRideId();
            }
          } else if (data.noDriversAvailable || (data.status === 'CANCELLED' && data.cancellation_reason?.includes('NO_DRIVERS'))) {
            if (rId && (isMyRide || currentTrackedId === rId)) {
              if (!notifiedRidesRef.current.has(rId)) {
                notifiedRidesRef.current.add(rId);
                triggerNoDriverAlert(data.ride || { id: rId });
              }
              setActiveRide(null);
              clearSavedRideId();
            }
          } else if (data.ride && isMyRide) {
            if (!['COMPLETED', 'CANCELLED'].includes(data.ride.status)) {
              setActiveRide(data.ride);
              setSavedRideId(rId);
            }
          }
          loadData();
        }
      });

      const unsubNoDrivers = onNoDriversAvailable((data) => {
        console.warn('⚠️ No drivers available event received:', data);
        const rId = data?.rideId || data?.ride?.id;
        const currentTrackedId = getSavedRideId();
        const rideObj = data?.ride;
        const myPassId = profileRef.current?.id;
        const myUserId = userRef.current?.id;
        const isMyRide = rideObj && (
          (myPassId && rideObj.passenger_id === myPassId) ||
          (myUserId && rideObj.passenger_id === myUserId)
        );

        if (!isMyRide && (!currentTrackedId || rId !== currentTrackedId)) return;

        if (rId && !notifiedRidesRef.current.has(rId)) {
          notifiedRidesRef.current.add(rId);
          triggerNoDriverAlert(data?.ride || { id: rId });
        }
        setActiveRide(null);
        clearSavedRideId();
        loadData();
      });

      const unsubSurge = onSurgePricingUpdated((data) => {
        if (data?.multiplier !== undefined) {
          setSurgeMultiplier(parseFloat(data.multiplier));
        }
      });

      return () => {
        s.off('connect', onConn);
        s.off('disconnect', onDis);
        unsubStatus();
        unsubNoDrivers();
        unsubSurge();
      };
    }
  }, []);

  // Join Ride Channel & Listen to Driver GPS Location Stream
  useEffect(() => {
    if (activeRide?.id && !['COMPLETED', 'CANCELLED'].includes(activeRide.status)) {
      joinRideRoom(activeRide.id);

      const unsubLoc = onDriverLocation((loc) => {
        setLiveDriverLocation(loc);
      });

      return () => {
        leaveRideRoom(activeRide.id);
        unsubLoc();
      };
    } else {
      setLiveDriverLocation(null);
    }
  }, [activeRide?.id, activeRide?.status]);

  // Handle manual typing of pickup address and auto-resolve coordinates
  const handlePickupAddressChange = (e) => {
    const val = e.target.value;
    setPickupAddress(val);
    const coords = resolveCoordinates(val);
    if (coords) {
      setPickupLat(coords.lat);
      setPickupLng(coords.lng);
    }
  };

  // Handle manual typing of destination address and auto-resolve coordinates
  const handleDestAddressChange = (e) => {
    const val = e.target.value;
    setDestAddress(val);
    const coords = resolveCoordinates(val);
    if (coords) {
      setDestLat(coords.lat);
      setDestLng(coords.lng);
    }
  };

  const selectPickupLocation = (loc) => {
    setPickupAddress(loc.name);
    setPickupLat(loc.lat);
    setPickupLng(loc.lng);
    setPickupSearchOpen(false);
  };

  const selectDestLocation = (loc) => {
    setDestAddress(loc.name);
    setDestLat(loc.lat);
    setDestLng(loc.lng);
    setDestSearchOpen(false);
  };

  // Submit Ride Booking
  const handleBookRide = async (e) => {
    e.preventDefault();
    if (bookingLoading) return;

    // Validate that pickup and destination are not identical
    if (pickupAddress === destAddress || (pickupLat === destLat && pickupLng === destLng)) {
      setError('Pickup and destination locations cannot be the same. Please choose a different destination.');
      return;
    }

    setBookingLoading(true);
    setError(null);
    setMessage(null);
    setNoDriverAlert(false);
    setShowNoDriverModal(false);
    setCancelledRideInfo(null);

    // Safety fallback timer so button NEVER stays stuck in Dispatching...
    const safetyTimer = setTimeout(() => {
      setBookingLoading(false);
    }, 10000);

    try {
      const payload = {
        passenger_id: profile?.id || 'pass-seed-1',
        passenger_name: user?.name || 'Aarav Sharma',
        pickup_address: pickupAddress,
        pickup_latitude: parseFloat(pickupLat),
        pickup_longitude: parseFloat(pickupLng),
        destination_address: destAddress,
        destination_latitude: parseFloat(destLat),
        destination_longitude: parseFloat(destLng),
      };

      const res = await apiClient.post('/rides', payload);
      if (res.data.success) {
        setMessage(null); // Green popup removed as requested
        setActiveRide(res.data.data);
        if (res.data.data?.id) {
          setSavedRideId(res.data.data.id);
        }
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to submit ride request');
    } finally {
      clearTimeout(safetyTimer);
      setBookingLoading(false);
    }
  };

  // Switch Active Passenger Account
  const handleSwitchPassenger = async (email) => {
    try {
      setBookingLoading(true);
      setError(null);
      clearSavedRideId();
      setActiveRide(null);
      await switchPassenger(email);
      setMessage(`Switched active passenger account to: ${email}`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to switch passenger');
    } finally {
      setBookingLoading(false);
    }
  };

  // Cancel Active Ride
  const handleCancelRide = async (rideId) => {
    if (!window.confirm('Are you sure you want to cancel this ride request?')) return;
    try {
      const res = await apiClient.post(`/rides/${rideId}/cancel`);
      if (res.data.success) {
        setMessage('Ride has been cancelled.');
        setActiveRide(null);
        clearSavedRideId();
        dismissAllNoDriverAlerts();
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel ride');
    }
  };

  // Dismiss No Driver Modal
  const handleCloseModal = () => {
    dismissAllNoDriverAlerts();
  };

  // Retry Auto-Dispatch when no drivers are available
  const handleRetryDispatch = async () => {
    if (!activeRide) return;
    setRetryingDispatch(true);
    setError(null);
    try {
      const res = await apiClient.post(`/rides/${activeRide.id}/dispatch`);
      if (res.data?.dispatched) {
        setShowNoDriverModal(false);
        setMessage(`Driver matched! Nearest driver ${res.data.driver?.name || 'Driver'} assigned.`);
        await loadData();
      } else {
        setShowNoDriverModal(true);
        setMessage('Still no available drivers nearby. Please try again in a few moments or cancel.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retry dispatch');
    } finally {
      setRetryingDispatch(false);
    }
  };

  // Cancel directly from No Drivers Available Modal
  const handleCancelFromModal = async () => {
    if (!activeRide) {
      setShowNoDriverModal(false);
      return;
    }
    await handleCancelRide(activeRide.id);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED': return <span className="badge badge-success">COMPLETED</span>;
      case 'CANCELLED': return <span className="badge badge-neutral">CANCELLED</span>;
      case 'ABORTED_SOS': return <span className="badge" style={{ background: '#7F1D1D', color: '#FECACA', fontWeight: 800 }}>🛑 ABORTED (SOS)</span>;
      case 'RESCUE_RIDE': return <span className="badge" style={{ background: '#065F46', color: '#A7F3D0', fontWeight: 800 }}>RESCUE CAB</span>;
      case 'IN_PROGRESS': return <span className="badge badge-info">IN PROGRESS</span>;
      case 'DRIVER_ASSIGNED': return <span className="badge badge-warning">DRIVER ASSIGNED</span>;
      case 'DRIVER_ACCEPTED': return <span className="badge badge-info">DRIVER ACCEPTED</span>;
      case 'DRIVER_ARRIVED': return <span className="badge badge-info">DRIVER ARRIVED</span>;
      case 'REQUESTED': return <span className="badge badge-warning">REQUESTED</span>;
      case 'PENDING': return (
        <span 
          className="badge" 
          onClick={() => setShowNoDriverModal(true)}
          style={{ cursor: 'pointer', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', fontWeight: 700 }}
          title="Click to view details"
        >
          ⚠️ NO DRIVERS AVAILABLE
        </span>
      );
      default: return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="portal-page-wrapper">
      <div className="container passenger-portal-page">
      {/* Pop Message Modal: Ride Completed & Driver Rating */}
      {completedRideModal && (
        <div className="completed-modal-backdrop">
          <div className="completed-modal-dialog">
            {/* Close 'X' Button */}
            <button 
              onClick={() => setCompletedRideModal(null)}
              className="completed-modal-close-btn"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Celebration Icon Badge */}
            <div className="celebrate-icon-ring">
              <CheckCircle2 size={36} color="#10B981" />
            </div>

            <h2 className="completed-title">Your Ride is Completed!</h2>
            <p className="completed-subtitle">
              We hope you had a comfortable trip with GoDrop.
            </p>

            {/* Trip Route & Fare Preview */}
            <div className="completed-trip-card">
              <div className="completed-route-col">
                <div className="route-stop">
                  <span className="route-stop-dot green"></span>
                  <span className="route-stop-text">{completedRideModal.pickup_address}</span>
                </div>
                <div className="route-stop-divider"></div>
                <div className="route-stop">
                  <span className="route-stop-dot red"></span>
                  <span className="route-stop-text">{completedRideModal.destination_address}</span>
                </div>
              </div>
              <div className="completed-fare-tag">
                <span className="fare-tag-label">Fare Paid</span>
                <span className="fare-tag-val">₹{completedRideModal.fare_amount}</span>
              </div>
            </div>

            {/* Rating Section */}
            <div className="driver-rating-box">
              {!ratingSuccess ? (
                <>
                  <div className="rating-box-header">
                    <div className="driver-pill-icon">
                      <Car size={18} color="#2563EB" />
                    </div>
                    <div>
                      <h3 className="rate-driver-heading">
                        Rate your driver <span className="highlight-driver">{completedRideModal.driver_name || 'Rajesh Prajapati'}</span>
                      </h3>
                      <p className="rate-driver-meta">
                        {completedRideModal.vehicle_model || 'Vehicle'} • {completedRideModal.license_plate || 'Cab'}
                        {completedRideModal.driver_rating && (
                          <span className="current-driver-rating">
                            <Star size={12} fill="#F59E0B" color="#F59E0B" /> {completedRideModal.driver_rating}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 5-Star Interactive Rating Selector */}
                  <div className="star-rating-row">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = star <= (ratingHover || ratingScore);
                      return (
                        <button
                          key={star}
                          type="button"
                          className="star-click-btn"
                          onClick={() => setRatingScore(star)}
                          onMouseEnter={() => setRatingHover(star)}
                          onMouseLeave={() => setRatingHover(0)}
                          aria-label={`${star} Star`}
                        >
                          <Star 
                            size={36} 
                            fill={isFilled ? '#F59E0B' : 'transparent'} 
                            color={isFilled ? '#F59E0B' : '#CBD5E1'} 
                            strokeWidth={1.8}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Qualitative Rating Label */}
                  <div className="rating-text-label">
                    {ratingScore === 5 && '★★★★★ 5.0 - Exceptional & Professional! 🌟'}
                    {ratingScore === 4 && '★★★★☆ 4.0 - Great & Smooth Ride! 👍'}
                    {ratingScore === 3 && '★★★☆☆ 3.0 - Satisfactory Trip 🙂'}
                    {ratingScore === 2 && '★★☆☆☆ 2.0 - Below Expectations 😐'}
                    {ratingScore === 1 && '★☆☆☆☆ 1.0 - Poor Experience 😞'}
                  </div>

                  {/* Compliment Chips */}
                  <div className="chips-container">
                    {['Polite & Helpful', 'Clean Cab', 'Safe Driving', 'Smooth Route', 'On-Time'].map((chip) => {
                      const isSelected = ratingFeedback.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          className={`chip-btn ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              setRatingFeedback(ratingFeedback.replace(chip, '').replace(/,\s*,/, ',').trim());
                            } else {
                              setRatingFeedback(ratingFeedback ? `${ratingFeedback}, ${chip}` : chip);
                            }
                          }}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>

                  {/* Optional Comment */}
                  <textarea
                    className="rating-comment-box"
                    rows={2}
                    placeholder={`Write a note for ${completedRideModal.driver_name || 'your driver'} (optional)...`}
                    value={ratingFeedback}
                    onChange={(e) => setRatingFeedback(e.target.value)}
                  />

                  {/* Modal Action Buttons */}
                  <div className="rating-modal-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setCompletedRideModal(null)}
                      style={{ padding: '0.65rem 1.25rem' }}
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSubmitDriverRating}
                      disabled={ratingSubmitting}
                      style={{ padding: '0.65rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                    >
                      <Star size={16} fill="#FFFFFF" />
                      <span>{ratingSubmitting ? 'Submitting...' : `Submit Rating (${ratingScore} ★)`}</span>
                    </button>
                  </div>
                </>
              ) : (
                /* Success View After Rating */
                <div className="rating-success-view">
                  <div className="success-badge-circle">
                    <CheckCircle2 size={40} color="#10B981" />
                  </div>
                  <h3 className="success-heading">Rating Submitted!</h3>
                  <p className="success-sub">
                    Thank you! Your rating has been recorded and updated.
                  </p>
                  {updatedDriverRating && (
                    <div className="overall-rating-card">
                      <span>{completedRideModal.driver_name || 'Driver'}'s new overall rating is</span>
                      <b className="rating-highlight">
                        <Star size={16} fill="#F59E0B" color="#F59E0B" /> {updatedDriverRating}
                      </b>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setCompletedRideModal(null)}
                    style={{ marginTop: '1.25rem', width: '100%', padding: '0.75rem' }}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pop Message Modal: No Drivers Available */}
      {showNoDriverModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #fee2e2',
            padding: '2rem',
            textAlign: 'center',
            position: 'relative'
          }}>
            {/* Close 'X' Button */}
            <button 
              onClick={dismissAllNoDriverAlerts}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '0.25rem'
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Warning Icon Badge */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem auto',
              border: '2px solid #FCA5A5'
            }}>
              <AlertTriangle size={32} />
            </div>

            {/* 1-Minute Active Countdown Indicator Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#FFFBEB',
              color: '#B45309',
              border: '1px solid #FDE68A',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: 700,
              marginBottom: '0.75rem'
            }}>
              <Clock size={15} /> Showing on screen: {alertCountdown}s remaining (1 min)
            </div>

            {/* Progress Bar (60s countdown) */}
            <div style={{
              width: '100%',
              height: '5px',
              background: '#F1F5F9',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '1.25rem'
            }}>
              <div style={{
                width: `${(alertCountdown / 60) * 100}%`,
                height: '100%',
                background: alertCountdown > 15 ? '#DC2626' : '#EF4444',
                transition: 'width 1s linear'
              }} />
            </div>

            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1E293B', marginBottom: '0.5rem' }}>
              No Driver Available At This Moment
            </h3>

            <p style={{ fontSize: '0.92rem', color: '#64748B', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {noDriverReason || 'All nearby drivers have declined the ride request or are currently unavailable. Your ride request has been automatically cancelled.'}
            </p>

            {(activeRide || cancelledRideInfo) && (
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                textAlign: 'left',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748B' }}>Pickup:</span>
                  <b style={{ color: '#1E293B' }}>{(activeRide || cancelledRideInfo).pickup_address}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748B' }}>Destination:</span>
                  <b style={{ color: '#1E293B' }}>{(activeRide || cancelledRideInfo).destination_address}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Fare:</span>
                  <b style={{ color: '#2563EB' }}>₹{(activeRide || cancelledRideInfo).fare_amount}</b>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button 
                onClick={() => {
                  dismissAllNoDriverAlerts();
                  document.querySelector('.booking-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', fontSize: '0.95rem' }}
              >
                <Car size={16} /> Book Another Ride
              </button>

              <button 
                onClick={dismissAllNoDriverAlerts}
                className="btn btn-outline"
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top Banner */}
      <div className="portal-header">
        <h1 className="portal-title">Welcome back, {user?.name || 'Passenger'}</h1>
      </div>

      {/* Alerts */}
      {/* Red Alert Banner: Shown in place of green popup when all drivers reject (stays for 1 minute) */}
      {noDriverAlert && (
        <div 
          className="portal-alert" 
          style={{
            background: '#FEF2F2',
            border: '1.5px solid #FCA5A5',
            color: '#991B1B',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.12)',
            marginBottom: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#DC2626'
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span>No Drivers Available At This Moment</span>
                <span style={{
                  background: '#FEE2E2',
                  color: '#B91C1C',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.6rem',
                  borderRadius: '9999px',
                  border: '1px solid #FCA5A5',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}>
                  <Clock size={12} /> {alertCountdown}s remaining (1 min)
                </span>
              </div>
              <div style={{ fontSize: '0.88rem', color: '#7F1D1D', marginTop: '0.25rem', lineHeight: 1.4 }}>
                All nearby drivers have declined the ride request. Your ride request has been automatically cancelled.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={() => {
                dismissAllNoDriverAlerts();
                document.querySelector('.booking-card')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn btn-sm btn-primary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
            >
              <Car size={14} /> Book Another Ride
            </button>
            <button
              onClick={dismissAllNoDriverAlerts}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#991B1B',
                cursor: 'pointer',
                padding: '0.35rem',
                display: 'flex',
                alignItems: 'center'
              }}
              aria-label="Dismiss alert"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {message && !noDriverAlert && (
        <div className="portal-alert alert-success">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="portal-alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          {error.includes('Forbidden') && (
            <button 
              className="btn btn-sm btn-outline"
              onClick={() => handleSwitchPassenger('passenger@rideflow.io')}
              style={{ background: '#fff', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            >
              Switch to Passenger Account
            </button>
          )}
        </div>
      )}

      {/* Top Row: Profile Card & Active Trip Card (50% / 50% Split) */}
      <div className="portal-top-grid">
        {/* Passenger Profile Card */}
        <div className="card profile-card passenger-profile-card">
          <div className="profile-avatar-center">
            <div className="avatar-big-wrap">
              <PassengerDynamicAvatar name={user?.name} email={user?.email} />
            </div>
            <div className="profile-info-center">
              <h3 className="profile-name">{user?.name || 'Aarav Sharma'}</h3>
              <span className="profile-email">{user?.email || 'passenger@godrop.io'}</span>
            </div>
          </div>

          {/* Bottom Stats: Number of Rides Only */}
          <div className="profile-stats-row single-stat">
            <div className="profile-stat-box">
              <span className="stat-label">Total Rides</span>
              <span className="stat-val">{rides.length}</span>
            </div>
          </div>
        </div>

        {/* Live Active Ride Tracker Card */}
        <div className="card active-ride-card">
          <div className="card-header-row">
            <span className="card-label">Active Ride Status</span>
            {activeRide && getStatusBadge(activeRide.status)}
          </div>

          {activeRide ? (
            <div className="active-ride-body">
              <RideLifecycleTimeline currentStatus={activeRide.status} />

              <div className="active-ride-content-grid">
                {/* Left Sub-Column: Route & Driver Details */}
                <div className="active-ride-details-col">
                  <div className="trip-route-visual">
                    <div className="route-point">
                      <div className="dot green"></div>
                      <div>
                        <span className="point-tag">Pickup</span>
                        <p className="point-addr">{activeRide.pickup_address}</p>
                      </div>
                    </div>
                    <div className="route-line"></div>
                    <div className="route-point">
                      <div className="dot red"></div>
                      <div>
                        <span className="point-tag">Destination</span>
                        <p className="point-addr">{activeRide.destination_address}</p>
                      </div>
                    </div>
                  </div>

                  <div className="active-ride-meta">
                    <div>Fare: <b>₹{activeRide.fare_amount}</b></div>
                    <div>ID: <code>{activeRide.id.substring(0, 15)}...</code></div>
                  </div>

                  {activeRide.driver_name && activeRide.status !== 'ABORTED_SOS' && (
                    <div className="assigned-driver-card" style={{
                      background: activeRide.is_free_rescue ? '#ECFDF5' : 'var(--slate-50)',
                      border: activeRide.is_free_rescue ? '1.5px solid #34D399' : '1px solid var(--slate-200)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 0.9rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '0.4rem'
                    }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: activeRide.is_free_rescue ? '#059669' : 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 700 }}>
                          {activeRide.is_free_rescue ? 'Assigned Rescue Driver' : 'Assigned Driver'}
                        </span>
                        <h4 style={{ margin: '0.1rem 0', color: 'var(--slate-900)', fontSize: '0.9rem' }}>{activeRide.driver_name}</h4>
                        <span style={{ fontSize: '0.78rem', color: 'var(--slate-600)' }}>{activeRide.vehicle_model} • <code>{activeRide.license_plate}</code></span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#D97706', fontWeight: 700, fontSize: '0.85rem' }}>
                          <Star size={13} /> {activeRide.driver_rating || '4.90'}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, marginTop: '0.15rem' }}>
                          ● {activeRide.is_free_rescue ? 'Rescue En Route' : 'Assigned & En Route'}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRide.status === 'ABORTED_SOS' && (
                    <>
                      <div className="assigned-driver-card" style={{
                        background: '#FEF2F2',
                        border: '1.5px solid #F87171',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.75rem 0.9rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '0.4rem'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: '#DC2626', textTransform: 'uppercase', fontWeight: 800 }}>⛔ Previous Driver Suspended</span>
                          <h4 style={{ margin: '0.1rem 0', color: '#991B1B', fontSize: '0.9rem', textDecoration: 'line-through' }}>{activeRide.driver_name || 'Flagged Driver'}</h4>
                          <span style={{ fontSize: '0.78rem', color: '#B91C1C' }}>{activeRide.vehicle_model} • <code>{activeRide.license_plate}</code></span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="badge" style={{ background: '#7F1D1D', color: '#FECACA', fontSize: '0.72rem', fontWeight: 800 }}>
                            LOCKED OUT
                          </span>
                          <div style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600, marginTop: '0.15rem' }}>
                            ● Account Suspended
                          </div>
                        </div>
                      </div>

                      <div style={{
                        background: '#F0FDF4',
                        border: '1.5px solid #34D399',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem',
                        marginTop: '0.65rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#065F46', fontWeight: 800, fontSize: '0.85rem' }}>
                            <LifeBuoy size={18} style={{ color: '#059669' }} />
                            <span>Emergency Safety Protocol</span>
                          </div>
                          <span className="badge badge-success" style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                            FREE RESCUE (₹0.00)
                          </span>
                        </div>
                        <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.78rem', color: '#047857', lineHeight: '1.4' }}>
                          The suspended driver has been locked out. Re-routing your ride to the nearest available rescue driver from your current GPS coordinates.
                        </p>
                        <button
                          onClick={handleRequestNearestRescue}
                          disabled={rescueLoading}
                          className="btn btn-primary"
                          style={{
                            width: '100%',
                            padding: '0.65rem',
                            background: '#059669',
                            borderColor: '#059669',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          {rescueLoading ? <RefreshCw size={14} className="spin" /> : <Navigation size={14} />}
                          <span>{rescueLoading ? 'Allocating Nearest Driver...' : 'Allocate Nearest Rescue Driver Now'}</span>
                        </button>
                      </div>
                    </>
                  )}

                  {/* Socket.IO Live Driver GPS Telemetry Stream */}
                  {liveDriverLocation && (
                    <div style={{
                      background: '#ECFDF5',
                      border: '1px solid #A7F3D0',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.55rem 0.75rem',
                      marginTop: '0.4rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#065F46'
                    }}>
                      <span className="dot pulse-green" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', display: 'inline-block', flexShrink: 0 }}></span>
                      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <b>⚡ Live GPS:</b> {liveDriverLocation.driverName || 'Driver'} at <code>{Number(liveDriverLocation.latitude).toFixed(4)}° N, {Number(liveDriverLocation.longitude).toFixed(4)}° E</code>
                        {liveDriverLocation.speed > 0 && <span style={{ marginLeft: '0.35rem', color: '#047857' }}>({liveDriverLocation.speed} km/h)</span>}
                      </div>
                    </div>
                  )}

                  {/* No Drivers Available Warning Banner in Card */}
                  {activeRide.status === 'PENDING' && !activeRide.driver_id && (
                    <div style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 0.85rem',
                      marginTop: '0.4rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      color: '#991B1B',
                      fontSize: '0.82rem'
                    }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0, color: '#DC2626' }} />
                      <div style={{ flex: 1 }}>
                        <b style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.1rem' }}>No Driver Available</b>
                        <span>Nearby drivers declined or timed out.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button 
                          onClick={() => setShowNoDriverModal(true)}
                          className="btn btn-sm btn-outline"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fff' }}
                        >
                          Details
                        </button>
                        <button 
                          onClick={handleRetryDispatch}
                          disabled={retryingDispatch}
                          className="btn btn-sm btn-primary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                        >
                          <RefreshCw size={12} className={retryingDispatch ? 'spin' : ''} /> Retry
                        </button>
                      </div>
                    </div>
                  )}

                  {['REQUESTED', 'PENDING', 'DRIVER_ASSIGNED'].includes(activeRide.status) && (
                    <button 
                      onClick={() => handleCancelRide(activeRide.id)} 
                      className="btn btn-outline btn-cancel"
                      style={{ marginTop: '0.5rem' }}
                    >
                      <XCircle size={16} /> Cancel Ride Request
                    </button>
                  )}

                  {/* In-Ride SOS Trigger Button - DISPLAYED ONLY WHEN STATUS IS IN_PROGRESS */}
                  {activeRide.status === 'IN_PROGRESS' && (
                    <div style={{ marginTop: '0.65rem' }}>
                      <button 
                        onClick={() => setShowSosModal(true)} 
                        className="btn-sos-emergency"
                        disabled={sosActive}
                        title="In-Ride Emergency SOS Protocol"
                      >
                        <ShieldAlert size={18} className="sos-beacon-pulse" />
                        <span>{sosActive ? '🚨 SOS ACTIVE • LIVE GPS STREAMING' : '🚨 EMERGENCY SOS'}</span>
                      </button>
                      <p className="sos-safety-hint">
                        Tap in case of emergency. Coordinates will stream directly to System Operations Command.
                      </p>
                    </div>
                  )}

                  {/* Active SOS Monitoring Banner */}
                  {sosActive && (
                    <div className="sos-live-monitoring-box">
                      <div className="sos-live-head">
                        <Radio size={16} className="radio-pulse" />
                        <b>🚨 SOS ALERT SENT – ADMIN MONITORING LIVE LOCATION</b>
                      </div>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.78rem', color: '#B91C1C' }}>
                        Live telemetry active. System Operations is tracking your ride coordinates in real time.
                      </p>
                      <div className="sos-audit-tag">
                        ✓ Simulated alert dispatched to Emergency Contacts & Local Authorities API.
                      </div>
                    </div>
                  )}

                  {/* Free Rescue Cab En-Route Notice */}
                  {(rescueDispatched || activeRide.is_free_rescue) && (
                    <div className="sos-rescue-banner">
                      <LifeBuoy size={18} style={{ color: '#059669', flexShrink: 0 }} />
                      <div>
                        <b style={{ display: 'block', fontSize: '0.82rem', color: '#065F46' }}>FREE RESCUE CAB ALLOCATED (₹0.00 FARE)</b>
                        <span style={{ fontSize: '0.75rem', color: '#047857' }}>
                          A safety rescue cab has been dispatched to your emergency coordinates.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Aborted Ride Notice */}
                  {activeRide.status === 'ABORTED_SOS' && (
                    <div className="sos-aborted-alert">
                      <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0 }} />
                      <div>
                        <b style={{ display: 'block', fontSize: '0.82rem', color: '#991B1B' }}>🛑 RIDE ABORTED VIA EMERGENCY SOS</b>
                        <span style={{ fontSize: '0.75rem', color: '#7F1D1D' }}>
                          This ride has been aborted by Operations Command. Driver suspended.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Sub-Column: Live Interactive Map */}
                <div className="active-ride-map-col">
                  <RideMap
                    pickupLocation={{
                      lat: activeRide.pickup_latitude,
                      lng: activeRide.pickup_longitude,
                      address: activeRide.pickup_address,
                    }}
                    destLocation={{
                      lat: activeRide.destination_latitude,
                      lng: activeRide.destination_longitude,
                      address: activeRide.destination_address,
                    }}
                    driverLocation={liveDriverLocation?.latitude && activeRide.status !== 'ABORTED_SOS' ? {
                      lat: liveDriverLocation.latitude,
                      lng: liveDriverLocation.longitude,
                      heading: liveDriverLocation.heading || 0,
                      name: activeRide.driver_name || liveDriverLocation.driverName || 'Driver',
                    } : (activeRide.driver_id && activeRide.status !== 'ABORTED_SOS' ? {
                      lat: activeRide.pickup_latitude,
                      lng: activeRide.pickup_longitude,
                      name: activeRide.driver_name,
                    } : null)}
                    statusText="Live"
                    height="100%"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="no-active-ride">
              {noDriverAlert && cancelledRideInfo && (
                <div style={{
                  width: '100%',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '12px',
                  padding: '1.1rem 1.25rem',
                  marginBottom: '1.25rem',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.1)'
                }}>
                  <AlertTriangle size={28} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <b style={{ color: '#991B1B', fontSize: '1rem', display: 'block', marginBottom: '0.2rem' }}>
                      No Driver Available At This Moment
                    </b>
                    <span style={{ color: '#7F1D1D', fontSize: '0.88rem', lineHeight: 1.4 }}>
                      All nearby drivers have declined the ride request. Your ride request has been automatically cancelled.
                    </span>
                  </div>
                  <button 
                    onClick={() => setShowNoDriverModal(true)}
                    className="btn btn-sm btn-outline"
                    style={{ background: '#ffffff', borderColor: '#DC2626', color: '#DC2626', fontWeight: 700, flexShrink: 0, padding: '0.45rem 0.85rem' }}
                  >
                    View Popup Modal
                  </button>
                </div>
              )}
              <CarCityIllustration />
              <p className="no-ride-title">No active ride in progress.</p>
              <span className="no-ride-subtext">Use the booking form below to request a ride.</span>
            </div>
          )}
        </div>
      </div>

      {/* Booking Form Card */}
      <div className="card booking-card">
        <div className="booking-card-head">
          <div className="head-title-wrap">
            <MapPin size={22} className="icon-blue" />
            <div>
              <h2 className="head-title">Book a New Ride</h2>
              <p className="head-sub">Enter pickup and destination locations to calculate fare and request a ride.</p>
            </div>
          </div>
          <div className="fare-preview-pill">
            <span className="pill-label">Est. Distance:</span>
            <span className="pill-val">{estimatedDistance} km</span>
            <span className="pill-sep">|</span>
            <span className="pill-label">Est. Fare:</span>
            <span className="pill-fare">₹{estimatedFare}</span>
            {surgeMultiplier > 1.0 && (
              <span style={{
                marginLeft: '0.4rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                background: '#FEF3C7',
                color: '#B45309',
                fontSize: '0.72rem',
                fontWeight: 700,
                border: '1px solid #FDE68A'
              }}>
                ⚡ {surgeMultiplier.toFixed(1)}x Surge
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleBookRide} className="booking-form-grid">
          {/* Autocomplete Datalist for Fast Location Suggestions */}
          <datalist id="ahmedabad-location-list">
            {AHMEDABAD_LOCATIONS.map((loc) => (
              <option key={loc.name} value={loc.name} />
            ))}
          </datalist>

          {/* Pickup Selection */}
          <div className="form-column">
            <h4 className="col-heading"><span className="dot green"></span> Pickup Location</h4>
            <div className="form-group location-input-group" ref={pickupDropdownRef}>
              <label className="input-label">Enter Pickup Location</label>
              <div className="input-with-clear">
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search pickup address (e.g. Airport, SG Highway)..."
                  value={pickupAddress} 
                  onChange={handlePickupAddressChange}
                  onFocus={() => { setPickupSearchOpen(true); setDestSearchOpen(false); }}
                  required 
                />
                {pickupAddress && (
                  <button 
                    type="button" 
                    className="input-clear-btn" 
                    title="Clear"
                    onClick={() => { setPickupAddress(''); setPickupSearchOpen(true); }}
                  >
                    ×
                  </button>
                )}
              </div>

              {pickupSearchOpen && (
                <div className="location-autocomplete-dropdown">
                  <div className="dropdown-scroll-list">
                    {searchAhmedabadLocations(pickupAddress).slice(0, 30).map(loc => (
                      <div
                        key={loc.name}
                        className={`autocomplete-item ${pickupAddress === loc.name ? 'selected' : ''}`}
                        onMouseDown={() => selectPickupLocation(loc)}
                      >
                        <div className="item-icon-wrap green">
                          <MapPin size={15} />
                        </div>
                        <div className="item-text-wrap">
                          <span className="item-name">{loc.name}</span>
                          {loc.subtitle && <span className="item-subtitle">{loc.subtitle}</span>}
                        </div>
                      </div>
                    ))}
                    {pickupAddress && searchAhmedabadLocations(pickupAddress).length === 0 && (
                      <div 
                        className="autocomplete-item custom-address-item"
                        onMouseDown={() => {
                          const resolved = resolveCoordinates(pickupAddress);
                          if (resolved) {
                            setPickupLat(resolved.lat);
                            setPickupLng(resolved.lng);
                          }
                          setPickupSearchOpen(false);
                        }}
                      >
                        <div className="item-icon-wrap green">
                          <Compass size={15} />
                        </div>
                        <div className="item-text-wrap">
                          <span className="item-name">Custom Location: "{pickupAddress}"</span>
                          <span className="item-subtitle">Ahmedabad Municipal Region • Auto-mapped</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="quick-location-chips">
              <span className="chips-label">Popular:</span>
              {POPULAR_PICKUPS.map(loc => (
                <button
                  type="button"
                  key={loc.name}
                  className={`location-chip ${pickupAddress === loc.name ? 'active' : ''}`}
                  onClick={() => selectPickupLocation(loc)}
                >
                  {loc.shortName || loc.name}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Selection */}
          <div className="form-column">
            <h4 className="col-heading"><span className="dot red"></span> Destination Location</h4>
            <div className="form-group location-input-group" ref={destDropdownRef}>
              <label className="input-label">Enter Destination Location</label>
              <div className="input-with-clear">
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search destination address (e.g. Riverfront, GIFT City)..."
                  value={destAddress} 
                  onChange={handleDestAddressChange} 
                  onFocus={() => { setDestSearchOpen(true); setPickupSearchOpen(false); }}
                  required 
                />
                {destAddress && (
                  <button 
                    type="button" 
                    className="input-clear-btn" 
                    title="Clear"
                    onClick={() => { setDestAddress(''); setDestSearchOpen(true); }}
                  >
                    ×
                  </button>
                )}
              </div>

              {destSearchOpen && (
                <div className="location-autocomplete-dropdown">
                  <div className="dropdown-scroll-list">
                    {searchAhmedabadLocations(destAddress).slice(0, 30).map(loc => (
                      <div
                        key={loc.name}
                        className={`autocomplete-item ${destAddress === loc.name ? 'selected' : ''}`}
                        onMouseDown={() => selectDestLocation(loc)}
                      >
                        <div className="item-icon-wrap red">
                          <MapPin size={15} />
                        </div>
                        <div className="item-text-wrap">
                          <span className="item-name">{loc.name}</span>
                          {loc.subtitle && <span className="item-subtitle">{loc.subtitle}</span>}
                        </div>
                      </div>
                    ))}
                    {destAddress && searchAhmedabadLocations(destAddress).length === 0 && (
                      <div 
                        className="autocomplete-item custom-address-item"
                        onMouseDown={() => {
                          const resolved = resolveCoordinates(destAddress);
                          if (resolved) {
                            setDestLat(resolved.lat);
                            setDestLng(resolved.lng);
                          }
                          setDestSearchOpen(false);
                        }}
                      >
                        <div className="item-icon-wrap red">
                          <Compass size={15} />
                        </div>
                        <div className="item-text-wrap">
                          <span className="item-name">Custom Location: "{destAddress}"</span>
                          <span className="item-subtitle">Ahmedabad Municipal Region • Auto-mapped</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="quick-location-chips">
              <span className="chips-label">Popular:</span>
              {POPULAR_DESTINATIONS.map(loc => (
                <button
                  type="button"
                  key={loc.name}
                  className={`location-chip ${destAddress === loc.name ? 'active' : ''}`}
                  onClick={() => selectDestLocation(loc)}
                >
                  {loc.shortName || loc.name}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Fine-Tune GPS Coordinates (Collapsed) */}
          <details className="advanced-gps-details">
            <summary className="advanced-gps-summary">⚙️ Fine-Tune GPS Coordinates (Optional)</summary>
            <div className="advanced-gps-body">
              <div className="booking-form-grid" style={{ gap: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#16A34A', display: 'block', marginBottom: '0.4rem' }}>Pickup GPS</span>
                  <div className="coords-row">
                    <div className="form-group">
                      <label className="input-label">Latitude</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        className="form-input" 
                        value={pickupLat} 
                        onChange={(e) => setPickupLat(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label className="input-label">Longitude</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        className="form-input" 
                        value={pickupLng} 
                        onChange={(e) => setPickupLng(e.target.value)} 
                        required 
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#DC2626', display: 'block', marginBottom: '0.4rem' }}>Destination GPS</span>
                  <div className="coords-row">
                    <div className="form-group">
                      <label className="input-label">Latitude</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        className="form-input" 
                        value={destLat} 
                        onChange={(e) => setDestLat(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label className="input-label">Longitude</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        className="form-input" 
                        value={destLng} 
                        onChange={(e) => setDestLng(e.target.value)} 
                        required 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* Interactive Route Preview Map */}
          <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
            <RideMap
              pickupLocation={{
                lat: pickupLat,
                lng: pickupLng,
                address: pickupAddress,
              }}
              destLocation={{
                lat: destLat,
                lng: destLng,
                address: destAddress,
              }}
              onMapClick={(lat, lng) => {
                const approxLat = Number(lat.toFixed(4));
                const approxLng = Number(lng.toFixed(4));
                let nearest = null;
                let minDist = 999;
                AHMEDABAD_LOCATIONS.forEach(loc => {
                  const d = calculateDistance(approxLat, approxLng, loc.lat, loc.lng);
                  if (d < minDist) {
                    minDist = d;
                    nearest = loc;
                  }
                });
                const customName = nearest && minDist < 2.0 
                  ? `Near ${nearest.shortName || nearest.name}`
                  : `Custom Location (${approxLat}, ${approxLng})`;
                setDestAddress(customName);
                setDestLat(approxLat);
                setDestLng(approxLng);
              }}
              clickHint="Click map to set destination location"
              statusText={null}
              height="480px"
            />
          </div>

          <div className="booking-submit-row">
            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              disabled={bookingLoading || (activeRide && !['COMPLETED', 'CANCELLED'].includes(activeRide.status))}
            >
              <Car size={18} />
              <span>{bookingLoading ? 'Dispatching...' : activeRide ? 'Active Ride Already in Progress' : `Confirm & Request Ride (₹${estimatedFare})`}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Ride History Table */}
      <div className="card history-card">
        <div className="history-head">
          <h3 className="history-title">Ride History & Assignments</h3>
          <span className="badge badge-neutral">{rides.length} Total Trips</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ride ID</th>
                <th>Pickup Location</th>
                <th>Destination</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {rides.length > 0 ? (
                (showAllRides ? rides : rides.slice(0, 5)).map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.id.substring(0, 12)}...</code></td>
                    <td>{r.pickup_address}</td>
                    <td>{r.destination_address}</td>
                    <td><b>₹{r.fare_amount}</b></td>
                    <td>{getStatusBadge(r.status)}</td>
                    <td>{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    No previous ride records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rides.length > 5 && (
          <div style={{ padding: '0.85rem', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              onClick={() => setShowAllRides(prev => !prev)}
              className="btn btn-outline btn-sm"
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#2563EB',
                borderColor: '#BFDBFE',
                background: '#EFF6FF',
                padding: '0.45rem 1.25rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer'
              }}
            >
              {showAllRides ? (
                <>Show Less <ChevronUp size={15} /></>
              ) : (
                <>Show More ({rides.length - 5} older rides) <ChevronDown size={15} /></>
              )}
            </button>
          </div>
        )}
      </div>

      {/* In-Ride Emergency SOS Confirmation Modal */}
      {showSosModal && (
        <div className="sos-modal-overlay">
          <div className="sos-modal-content">
            <div className="sos-modal-head">
              <div className="sos-modal-icon-wrap">
                <ShieldAlert size={28} />
              </div>
              <div>
                <h3 className="sos-modal-title">Confirm In-Ride Emergency SOS</h3>
                <span className="sos-modal-subtitle">Direct Hotline to System Operations Command</span>
              </div>
            </div>

            <p className="sos-modal-text">
              Are you in immediate danger or facing an emergency during your ride?
            </p>

            <div className="sos-modal-info-box">
              <div className="sos-info-row">
                <span>Active Ride:</span>
                <code>{activeRide?.id?.substring(0, 18)}...</code>
              </div>
              <div className="sos-info-row">
                <span>Driver:</span>
                <b>{activeRide?.driver_name || 'Assigned Driver'}</b>
              </div>
              <div className="sos-info-row">
                <span>Vehicle:</span>
                <span>{activeRide?.vehicle_model} (<code>{activeRide?.license_plate}</code>)</span>
              </div>
              <div className="sos-info-warning">
                ⚠️ Activating SOS will immediately alert System Operations, stream your live coordinates every 3s, and initiate automated rescue dispatch.
              </div>
            </div>

            <div className="sos-modal-actions">
              <button
                onClick={handleTriggerSos}
                disabled={sosLoading}
                className="btn-sos-confirm-trigger"
              >
                {sosLoading ? <RefreshCw size={18} className="spin" /> : <ShieldAlert size={18} />}
                <span>{sosLoading ? 'Transmitting Alert...' : 'Yes, Trigger Emergency SOS'}</span>
              </button>
              <button
                onClick={() => setShowSosModal(false)}
                disabled={sosLoading}
                className="btn-sos-dismiss"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
};

export default PassengerPortal;
