// Truck number normalization utilities (ported from original San Marine ERP)
// Maritime Cargo Scale standard rules.

export function convertBengaliToEnglishDigits(str) {
  if (!str) return '';
  const bengaliNumbers = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/[০-৯]/g, (w) => String(bengaliNumbers.indexOf(w)));
}

export function normalizeTruckNumber(raw) {
  if (!raw) return '';
  let cleaned = convertBengaliToEnglishDigits(raw.trim()).toUpperCase();

  cleaned = cleaned
    .replace(/(?:DHAKA|DHA)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা|ন|ম|গ|হ|ছ|দ|ব|খ|জ|ঝ)?/gi, 'DMT')
    .replace(/ঢাকা\s*মেট্?রো[\s\-]*(?:ট|তা|থা|ন|ম|গ|হ|ছ|দ|ব|খ|জ|ঝ)?/gi, 'DMT')
    .replace(/(?:CHATTOGRAM|CHATTO|CTG)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা)?/gi, 'CTG')
    .replace(/চট্?ট\s*মেট্?রো[\s\-]*(?:ট|তা|থা|ন|ম|গ|হ|ছ|দ|ব|খ|জ|ঝ)?/gi, 'CTG')
    .replace(/(?:KHULNA|KHL)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা)?/gi, 'KHL')
    .replace(/খুলনা\s*মেট্?রো[\s\-]*(?:ট|তা|থা|ন|ম|গ|হ|ছ|দ|ব|খ|জ|ঝ)?/gi, 'KHL')
    .replace(/(?:RAJSHAHI|RAJ)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা)?/gi, 'RAJ')
    .replace(/রাজশাহী\s*মেট্?রো[\s\-]*(?:ট|তা|থা)?/gi, 'RAJ')
    .replace(/(?:BARISHAL|BAR)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা)?/gi, 'BAR')
    .replace(/বরিশাল\s*মেট্?রো[\s\-]*(?:ট|তা|থা)?/gi, 'BAR')
    .replace(/(?:SYLHET|SYL)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা)?/gi, 'SYL')
    .replace(/সিলেট\s*মেট্?রো[\s\-]*(?:ট|তা|থা)?/gi, 'SYL')
    .replace(/(?:RANGPUR|RNG)[\s\-]*(?:METRO|MET)?[\s\-]*(?:T|TA|NA|MA|GA|HA|CHA|DA|BA|KHA|JA|JHA|ট|তা|থা)?/gi, 'RNG')
    .replace(/রংপুর\s*মেট্?রো[\s\-]*(?:ট|তা|থা)?/gi, 'RNG');

  let alphanumeric = cleaned.replace(/[^A-Z0-9]/g, '');

  if (/^\d{5,7}$/.test(alphanumeric)) {
    alphanumeric = `DMT${alphanumeric}`;
  }

  return alphanumeric;
}

export function isSameTruck(rawA, rawB) {
  if (!rawA || !rawB) return false;
  const normA = normalizeTruckNumber(rawA);
  const normB = normalizeTruckNumber(rawB);
  if (normA === normB) return true;
  const digitsA = normA.replace(/\D/g, '');
  const digitsB = normB.replace(/\D/g, '');
  if (digitsA && digitsB && digitsA === digitsB && digitsA.length >= 5) {
    return true;
  }
  return false;
}

export function formatTruckDisplay(raw) {
  if (!raw) return '';
  return convertBengaliToEnglishDigits(raw.trim()).toUpperCase();
}