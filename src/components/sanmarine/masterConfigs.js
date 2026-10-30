const STATUS = ['Active', 'Completed', 'Pending'];

export const MASTER_CONFIGS = {
  vessels: {
    title: 'মাদার ভেসেল', entity: 'MotherVessel',
    fields: [
      { key: 'name', label: 'ভেসেল নাম', required: true },
      { key: 'company', label: 'কোম্পানি', options: ['SAN MARINE SURVEY & INSPECTION', 'SEAQUANT MARINE SERVICES'], required: true },
      { key: 'cargoType', label: 'কার্গো টাইপ' },
      { key: 'capacityMT', label: 'ক্যাপাসিটি (MT)', type: 'number' },
      { key: 'totalCargoMT', label: 'মোট কার্গো (MT)', type: 'number' },
      { key: 'arrivalDate', label: 'আগমন তারিখ', type: 'date' },
      { key: 'status', label: 'স্ট্যাটাস', options: STATUS, default: 'Active' },
    ],
    sub: (i) => [i.company, i.cargoType, i.totalCargoMT ? `${i.totalCargoMT} MT` : '', i.arrivalDate].filter(Boolean).join(' · '),
    inUse: (i, l) => ((l.lighters || []).some(x => x.motherVesselId === i.id) ? 'এই ভেসেলের অধীনে লাইটার আছে — আগে লাইটার মুছুন।' : ''),
  },
  lighters: {
    title: 'লাইটার ভেসেল', entity: 'LighterVessel',
    fields: [
      { key: 'name', label: 'লাইটার নাম', required: true },
      { key: 'motherVesselId', label: 'মাদার ভেসেল', from: 'vessels', required: true },
      { key: 'consigneeId', label: 'আমদানিকারক', from: 'consignees' },
      { key: 'company', label: 'কোম্পানি (মাদার ভেসেল থেকে স্বয়ংক্রিয়)', options: ['SAN MARINE SURVEY & INSPECTION', 'SEAQUANT MARINE SERVICES'], readOnly: true },
      { key: 'status', label: 'স্ট্যাটাস', options: STATUS, default: 'Active' },
    ],
    sub: (i, l) => [i.company, (l.vessels || []).find(v => v.id === i.motherVesselId)?.name, i.consigneeName].filter(Boolean).join(' · '),
    beforeSave: (data, l) => {
      const vessel = (l.vessels || []).find(v => v.id === data.motherVesselId);
      return { ...data, consigneeName: (l.consignees || []).find(c => c.id === data.consigneeId)?.name || '', company: vessel?.company || data.company || '' };
    },
  },
  ghats: {
    title: 'ঘাট তালিকা', entity: 'Ghat',
    fields: [
      { key: 'name', label: 'ঘাট নাম', required: true },
      { key: 'location', label: 'অবস্থান' },
    ],
    sub: (i) => i.location || '',
    beforeSave: (data) => ({ ...data, name: data.name.toUpperCase() }),
  },
  cargos: {
    title: 'কার্গো তালিকা', entity: 'Cargo',
    fields: [
      { key: 'name', label: 'কার্গো নাম', required: true },
      { key: 'type', label: 'টাইপ' },
      { key: 'unit', label: 'একক', default: 'MT' },
    ],
    sub: (i) => [i.type, i.unit].filter(Boolean).join(' · '),
  },
  scales: {
    title: 'স্কেল নাম', entity: 'Scale',
    fields: [
      { key: 'name', label: 'স্কেল নাম', required: true },
      { key: 'note', label: 'নোট' },
    ],
    sub: (i) => i.note || '',
    beforeSave: (data) => ({ ...data, name: data.name.toUpperCase() }),
  },
  consignees: {
    title: 'আমদানিকারক / পার্টি', entity: 'Consignee',
    fields: [
      { key: 'name', label: 'আমদানিকারক নাম', required: true },
      { key: 'company', label: 'কোম্পানি', options: ['SAN MARINE SURVEY & INSPECTION', 'SEAQUANT MARINE SERVICES'], required: true },
      { key: 'address', label: 'ঠিকানা' },
      { key: 'contactPerson', label: 'যোগাযোগ ব্যক্তি' },
      { key: 'phone', label: 'ফোন' },
    ],
    sub: (i) => [i.company, i.contactPerson, i.phone, i.address].filter(Boolean).join(' · '),
    inUse: (i, l) => ((l.lighters || []).some(x => x.consigneeId === i.id) ? 'এই আমদানিকারকের লাইটার আছে — আগে লাইটার থেকে সরান।' : ''),
  },
};