function combineVenueData({ cricbuzz = {}, espn = {}, cricketDotCom = {} }) {
  // First, clean up the source objects
  [cricbuzz, espn, cricketDotCom].forEach(source => {
    if (source.scraped) delete source.scraped;

    if (source.sKnownAs) {
      source.aAlsoKnownAs = source.sKnownAs
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      delete source.sKnownAs;
    }

    if (source.Opened && !source.opened) {
      source.opened = source.Opened;
      delete source.Opened;
    }

    if (source.Curator && !source.curator) {
      source.sCurator = source.Curator;
      delete source.Curator;
    }

    if (source.floodLights && !source.sFloodlights) {
      source.sFloodlights = source.floodLights;
      delete source.floodLights;
    }

    if (source['home to'] && typeof source['home to'] === 'string') {
      source['home to'] = source['home to'].split(',').map(s => s.trim()).filter(Boolean);
    }

    if (Array.isArray(source.homeTeams) && source.homeTeams.length === 0) {
      delete source.homeTeams;
    }

    if (source.sFloodlights && source.floodLights) {
      delete source.floodLights;
    }

    if (source.venueName && source.sVenueName) {
      if (source.venueName !== source.sVenueName) {
        if (!source.aAlsoKnownAs) source.aAlsoKnownAs = [];
        if (!source.aAlsoKnownAs.includes(source.venueName)) {
          source.aAlsoKnownAs = [source.venueName, ...(source.aAlsoKnownAs || [])];
        }
      }
      delete source.venueName;
    }

    if (source.oStats) {
      const formatStats = (format) => {
        const stats = source.oStats[format.toLowerCase()];
        if (!stats) return {};

        return {
          [`first${format}`]: {
            date: stats[`first${format}Date`] || '',
            year: stats[`first${format}Year`] || '',
            teams: stats[`first${format}Teams`] || '',
            matchResult: stats[`first${format}Result`] || ''
          },
          [`recent${format}`]: {
            date: stats[`recent${format}Date`] || '',
            year: stats[`recent${format}Year`] || '',
            teams: stats[`recent${format}Teams`] || '',
            matchResult: stats[`recent${format}Result`] || ''
          },
          highestTeamScore: {
            score: stats.Highest?.total || stats.Highest?.score || '',
            date: stats.Highest?.date || '',
            year: stats.Highest?.year || '',
            teams: stats.Highest?.teams || '',
            matchResult: stats.Highest?.result || ''
          },
          lowestTeamScore: {
            score: stats.Lowest?.total || stats.Lowest?.score || '',
            date: stats.Lowest?.date || '',
            year: stats.Lowest?.year || '',
            teams: stats.Lowest?.teams || '',
            matchResult: stats.Lowest?.result || ''
          }
        };
      };

      if (!source.stats) source.stats = {};
      if (source.oStats.test) source.stats.test = formatStats('Test');
      if (source.oStats.odi) source.stats.odi = formatStats('Odi');
      if (source.oStats.t20) source.stats.t20 = formatStats('T20');
    }
  });


  const rawData = { ...cricbuzz, ...espn, ...cricketDotCom };
  const standardizedData = {};

  const fieldMappings = {
    'sVenueName': ['venueName', 'Name', 'sName'],
    'opened': ['Opened', 'Established', 'sEstablishment'],
    'sCapacity': ['Capacity', 'capacity'],
    'sArea': ['sLocation', 'Location', 'Country', 'country'],
    'sTimeZone': ['Time Zone', 'timeZone', 'sTimezone', 'time_zone'],
    'sFloodlights': ['Flood Lights', 'Floodlights', 'Flood lights', 'floodLights', 'flood lights'],
    'sCurator': ['Curator', 'curator', 'groundsman', 'pitchCurator'],
    'sPitch': ['pitchType', 'pitchCondition', 'surface'],
    'aOtherSports': ['Other Sports', 'Other_Sports_it_is_home_to', 'other_sports', 'sports', 'sOtherSports'],
    'aHomeTeams': ['homeTeams', 'home_to', 'Home Teams', 'Home to'],
    'aEnds': ['ends', 'Ends', 'Bowling Ends'],
    'aAlsoKnownAs': ['Also known as', 'Known as'],
  };

  // First, handle sArea with priority
  if (cricbuzz.sLocation || cricbuzz.Location || cricbuzz.Country || cricbuzz.country) {
    standardizedData.sArea = cricbuzz.sLocation || cricbuzz.Location || cricbuzz.Country || cricbuzz.country;
  } else if (cricketDotCom.sLocation || cricketDotCom.Location || cricketDotCom.Country || cricketDotCom.country) {
    standardizedData.sArea = cricketDotCom.sLocation || cricketDotCom.Location || cricketDotCom.Country || cricketDotCom.country;
  } else if (espn.sLocation || espn.Location || espn.Country || espn.country) {
    standardizedData.sArea = espn.sLocation || espn.Location || espn.Country || espn.country;
  }

  [cricbuzz, espn, cricketDotCom].forEach(source => {
    Object.entries(fieldMappings).forEach(([standardField, aliases]) => {
      // Skip sArea as we've already handled it
      if (standardField === 'sArea') return;

      if (source[standardField] !== undefined) {
        standardizedData[standardField] = source[standardField];
        return;
      }
      for (const alias of aliases) {
        if (source[alias] !== undefined) {
          standardizedData[standardField] = source[alias];
          break;
        }
      }
    });
  });

  const mergedData = { ...rawData, ...standardizedData };

  Object.entries(fieldMappings).forEach(([standardField, aliases]) => {
    aliases.forEach(alias => {
      if (mergedData[alias] && mergedData[standardField]) {
        delete mergedData[alias];
      }
    });
  });

  const keyMap = {
    Name: 'sVenueName',
    venueName: 'sVenueName',
    sKnownAs: 'aAlsoKnownAs',
    'alsoKnownAs': 'aAlsoKnownAs',
    'Also knows as': 'aAlsoKnownAs',
    Capacity: 'sCapacity',
    Ends: 'aEnds',
    'curator': 'sCurator',
    'Home to': 'aHomeTeams',
    Location: 'sArea',
    'Time Zone': 'sTimeZone',
    'Floodlights': 'sFloodlights',
    'Flood lights': 'sFloodlights',
    "flood lights": "sFloodLights",   // lowercase fallback
    'Other sports': 'aOtherSports',
    'Known as': 'aAlsoKnownAs',
    'pitch': 'sPitch',
    'Establishment': 'sOpened',
    'opened': 'sOpened',
    'Time_Zone': 'sTimeZone',
    'ends': 'aEnds',
    'homeTo': 'aHomeTeams',
    'home_to': 'aHomeTeams',
    'Home Teams': 'aHomeTeams',
    'stats': 'oStats',
    'otherSports': 'aOtherSports',
    'Other_Sports_it_is_home_to': 'aOtherSports'
  };

  const formattedData = {};

  // --- Deduplication fix for arrays ---
  const dedupeArray = (arr) =>
    [...new Set((Array.isArray(arr) ? arr : [arr]).map(s => s?.trim()).filter(Boolean))];

  // aEnds
  if (mergedData.aEnds || mergedData.ends) {
    formattedData.aEnds = dedupeArray(mergedData.aEnds || mergedData.ends);
  } else if (cricbuzz.aEnds || espn.aEnds || cricketDotCom.aEnds) {
    formattedData.aEnds = dedupeArray(cricbuzz.aEnds || espn.aEnds || cricketDotCom.aEnds);
  } else {
    formattedData.aEnds = [];
  }

  // aHomeTeams
  if (mergedData.aHomeTeams || mergedData['home to']) {
    formattedData.aHomeTeams = dedupeArray(mergedData.aHomeTeams || mergedData['home to']);
  } else if (cricbuzz['Home to'] || cricbuzz['Home Team'] || espn['Home Teams']) {
    const homeTeams = [];
    if (cricbuzz['Home to']) homeTeams.push(...dedupeArray(cricbuzz['Home to']));
    if (cricbuzz['Home Team']) homeTeams.push(...dedupeArray(cricbuzz['Home Team']));
    if (espn['Home Teams']) homeTeams.push(...dedupeArray(espn['Home Teams']));
    formattedData.aHomeTeams = dedupeArray(homeTeams);
  } else {
    formattedData.aHomeTeams = [];
  }

  // aAlsoKnownAs
  const knownAs = [];
  if (mergedData.aAlsoKnownAs) knownAs.push(...dedupeArray(mergedData.aAlsoKnownAs));
  if (mergedData.sKnownAs) knownAs.push(...dedupeArray(mergedData.sKnownAs));
  if (mergedData['Also known as']) knownAs.push(...dedupeArray(mergedData['Also known as']));
  if (mergedData['Known as']) knownAs.push(...dedupeArray(mergedData['Known as']));

  [cricbuzz, espn, cricketDotCom].forEach(source => {
    if (source['Also known as']) knownAs.push(...dedupeArray(source['Also known as']));
    if (source['Known as']) knownAs.push(...dedupeArray(source['Known as']));
    if (source.sKnownAs) knownAs.push(...dedupeArray(source.sKnownAs));
    if (source.aAlsoKnownAs) knownAs.push(...dedupeArray(source.aAlsoKnownAs));
  });

  formattedData.aAlsoKnownAs = dedupeArray(knownAs);

  // Process remaining fields
  for (const key in mergedData) {
    const value = mergedData[key];
    if (value === null || value === undefined || value === 'N/A' || value === '') continue;

    const skipFields = ['ends', 'home to', 'homeTo', 'home_to', 'homeTeams', 'Home Teams', 'sKnownAs',
      'Opened', 'Curator', 'floodLights', 'venueName'];
    if (skipFields.includes(key)) continue;

    const camelKey = keyMap[key] || key.replace(/\s+/g, '_');

    if ((camelKey === 'aEnds' && formattedData.aEnds.length) ||
      (camelKey === 'aHomeTeams' && formattedData.aHomeTeams.length) ||
      (camelKey === 'aAlsoKnownAs' && formattedData.aAlsoKnownAs.length)) {
      continue;
    }

    switch (camelKey) {
      case 'sCapacity':
        if (typeof value === 'string') {
          let cleanValue = value
            .replace(/\([^)]*\)/g, '')
            .replace(/[^\d,]/g, '')
            .replace(/,/g, '')
            .trim();
          if (cleanValue.length > 6) {
            cleanValue = cleanValue.substring(0, 6);
            if (/^0+$/.test(cleanValue)) cleanValue = '';
          }
          formattedData[camelKey] = cleanValue && !isNaN(cleanValue) ? cleanValue : '';
        } else {
          formattedData[camelKey] = value;
        }
        break;
      case 'aOtherSports':
        formattedData[camelKey] = dedupeArray(value);
        break;
      default:
        formattedData[camelKey] = value;
    }
  }

  // --- NEW CLEANUP FUNCTION ---
  // --- NEW CLEANUP FUNCTION ---
  function removeEmptyFields(obj) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => {
          if (v === null || v === undefined) return false;
          if (typeof v === 'string' && v.trim() === '') return false;

          if (Array.isArray(v)) {
            const cleanedArr = v
              .map(item => (typeof item === 'string' ? item.trim() : item))
              .filter(item => item !== '' && item !== null && item !== undefined);
            return cleanedArr.length > 0;
          }

          if (typeof v === 'object') {
            const cleaned = removeEmptyFields(v);
            return Object.keys(cleaned).length > 0;
          }

          return true;
        })
        .map(([k, v]) => {
          if (Array.isArray(v)) {
            const cleanedArr = v
              .map(item => (typeof item === 'string' ? item.trim() : item))
              .filter(item => item !== '' && item !== null && item !== undefined);
            return [k, cleanedArr];
          }
          if (typeof v === 'object' && !Array.isArray(v)) {
            return [k, removeEmptyFields(v)];
          }
          return [k, v];
        })
    );
  }


  return removeEmptyFields(formattedData);
}

module.exports = { combineVenueData };
