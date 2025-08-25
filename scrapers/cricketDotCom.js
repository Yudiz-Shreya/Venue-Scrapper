// cricket.com venue scraper with proper DOM manipulation
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Scrapes venue data from cricket.com
 * @param {string} url - The URL of the cricket.com venue page
 * @returns {Promise<Object>} - Venue data with stats
 */
async function scrapeCricketDotComVenue(url, city) {
  try {

   

    // 1. Fetch the page with proper headers
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.cricket.com/'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    // 2. Extract venue name
    const venueName = extractVenueName($);
    console.log(`Extracted venue name: ${venueName}`);

    // Card ko select karo
    const venueCard = $('div.bg-foreGround.px-4.pb-2.rounded-md');

    // Values nikalne ke liye
    const country = venueCard.find('p:contains("Country :")').next('p').text().trim();
    const capacity = venueCard.find('p:contains("Capacity :")').next('p').text().trim();
    const floodLights = venueCard.find('p:contains("Flood Lights :")').next('p').text().trim();
    // 3. Extract venue info
    const venueInfo = extractVenueInfo($);

    // 4. Extract cricket stats
    const stats = await extractCricketStats($);

    return {
      venueName,
      ...venueInfo,
      country,
      capacity,
      floodLights,
      stats
    };
  } catch (error) {
    console.error('Error scraping cricket.com:', error.message);
    throw error;
  }
}

/**
 * Extracts venue name from the page
 */
function extractVenueName($) {
  // Use the precise selector from the user's feedback.
  const selector = 'p[class="text-text-header/60 md:text-sm text-xs font-semibold"]';
  const nameElement = $(selector).first();

  if (nameElement.length > 0) {
    let name = nameElement.text().trim(); // e.g., "Narendra Modi Stadium, Ahmedabad"

    // Take only the part before the comma.
    if (name.includes(',')) {
      name = name.split(',')[0].trim();
    }

    if (name) {
      return name;
    }
  }

  // Fallback to h1 if the specific selector fails
  const fallbackElement = $('h1').first();
  if (fallbackElement.length > 0) {
    let name = fallbackElement.text().trim();
    if (name.includes(',')) {
      name = name.split(',')[0].trim();
    }
    return name;
  }

  return 'Unknown Venue';
}

/**
 * Extracts venue information
 */
function extractVenueInfo($, cardSelector) {
  const details = {};

  // map banado taaki label → proper key aa jaye
  const labelMap = {
    "name": "Name",
    "country": "Country",
    "city": "City",
    "capacity": "Capacity",
    "bowling ends": "Bowling Ends",
    "flood lights": "Flood Lights",
  };

  $(`${cardSelector} .flex.items-center.py-2.gap-2`).each((i, el) => {
    let label = $(el).find("p").first().text().trim().replace(/:$/, "");
    let value = $(el).find("p").last().text().trim();

    if (value && value !== "-") {
      const key = labelMap[label.toLowerCase()] || label; // normalize key
      details[key] = value;
    }
    console.log(details)
  });

  return details;
}

/**
 * Extracts cricket statistics from the venue page
 */
async function extractCricketStats($) {
  const stats = {
    test: {},
    odi: {},
    t20: {}
  };

  try {
    // First, try to extract detailed match information from format sections
    extractDetailedMatchInfo($, stats);

    // Then try to extract from individual stat cards if needed
    extractStatsFromIndividualCards($, stats);

    // Initialize all formats with empty objects if not already populated
    const formats = ['test', 'odi', 't20'];

    for (const format of formats) {
      if (!stats[format]) {
        stats[format] = getEmptyStats(format);
      } else {
        // Ensure all required fields exist
        const requiredFields = [
          `first${format.charAt(0).toUpperCase() + format.slice(1)}`,
          `recent${format.charAt(0).toUpperCase() + format.slice(1)}`,
          'highestTeamScore',
          'lowestTeamScore'
        ];

        for (const field of requiredFields) {
          if (!stats[format][field]) {
            stats[format][field] = {};
          }

          // If we have score fields but they're empty, try to find them in the page
          if ((field === 'highestTeamScore' || field === 'lowestTeamScore') &&
            (!stats[format][field].score || !stats[format][field].teams)) {

            // Look for score sections in the page
            const scoreSections = $('section, div, .stat-card, .stat-item').filter((i, el) => {
              const $el = $(el);
              const text = $el.text().toLowerCase();
              const isRelevant = text.includes(field.toLowerCase()) &&
                (text.includes('score') || text.includes('runs') ||
                  text.includes('high') || text.includes('low'));

              // Make sure it's not a container with too many elements (likely a parent container)
              const childElements = $el.find('*').length;
              return isRelevant && childElements < 20;
            });

            if (scoreSections.length > 0) {
              for (let i = 0; i < Math.min(scoreSections.length, 3); i++) {
                const $section = $(scoreSections[i]);

                // Try to find score in different ways
                let scoreText = $section.find('.score, [class*="score"], [class*="value"]').first().text().trim();

                // If no score found with classes, try to extract from text
                if (!scoreText) {
                  const text = $section.text();
                  const scoreMatch = text.match(/(\d+\/\d+)/);
                  if (scoreMatch) {
                    scoreText = scoreMatch[0];
                  }
                }

                if (scoreText) {
                  // Try to find details in the section
                  let details = '';
                  let teams = '';
                  let matchResult = '';
                  let date = '';
                  let year = '';

                  // Check for the new section structure
                  const $header = $section.find('header h2');
                  if ($header.length > 0) {
                    const sectionType = $header.text().trim();

                    // Extract date
                    const $dateElement = $section.find('.text-text-header:first-child');
                    if ($dateElement.length) {
                      date = $dateElement.text().trim();
                      const yearMatch = date.match(/(\d{4})/);
                      year = yearMatch ? yearMatch[0] : '';
                    }

                    // Extract teams and match result
                    const $teamsElement = $section.find('.flex.flex-col.text-text-header');
                    if ($teamsElement.length) {
                      const teamLines = [];
                      $teamsElement.find('p').each((i, el) => {
                        const text = $(el).text().trim();
                        if (text && !text.match(/^\d+\/\d+/) && !text.match(/^by [A-Za-z]+ on/)) {
                          teamLines.push(text);
                        }
                      });

                      // First line is usually the teams
                      if (teamLines.length > 0) {
                        teams = teamLines[0];
                        // Clean up team names
                        teams = teams.replace(/\s+/g, ' ').trim();

                        // Find the match result (look for lines with 'beat', 'won by', etc.)
                        const resultLine = teamLines.find(line =>
                          line.match(/beat|won by|defeated|drew with|tied with/i)
                        );

                        if (resultLine) {
                          matchResult = resultLine
                            .replace(/\d+\/\d+/g, '')  // Remove scores
                            .replace(/\d{4}/g, '')      // Remove years
                            .replace(/- by .+$/, '')    // Remove 'by Team on date'
                            .replace(/\s+/g, ' ')      // Normalize spaces
                            .trim();
                        } else if (teamLines.length > 1) {
                          // If no clear result line, use the second line
                          matchResult = teamLines[1]
                            .replace(/\d+\/\d+/g, '')
                            .replace(/\d{4}/g, '')
                            .replace(/- by .+$/, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        }
                      }
                    }
                  } else {
                    // Fallback to previous logic if new structure not found
                    details = $section.find('.details, .match-details, [class*="detail"], .match-info, .match-summary').first().text().trim();
                    if (!details) {
                      details = $section.text().replace(scoreText, '').trim();
                    }

                    // Extract date and year
                    const dateMatch = details.match(/([A-Za-z]+ \d{1,2}, \d{4})/);
                    date = dateMatch ? dateMatch[0] : '';
                    const yearMatch = date ? date.match(/(\d{4})/) : null;
                    year = yearMatch ? yearMatch[0] : '';

                    // Extract teams
                    const teamsMatch = details.match(/([A-Za-z]+(?: [A-Za-z]+)*) (?:vs|v) ([A-Za-z]+(?: [A-Za-z]+)*)/i);
                    if (teamsMatch) {
                      teams = `${teamsMatch[1]} vs ${teamsMatch[2]}`;
                    } else {
                      const lines = details.split('\n').filter(line => line.trim().length > 0);
                      if (lines.length >= 2) {
                        teams = `${lines[0].trim()} vs ${lines[1].trim()}`;
                      }
                    }

                    // Extract match result
                    const resultMatch = details.match(/([A-Za-z]+(?: [A-Za-z]+)* (?:beat|drew with|drawn with) [A-Za-z]+(?: [A-Za-z]+)*(?: by [\w\s-]+)?)/i);
                    if (resultMatch) {
                      matchResult = resultMatch[0];
                    }
                  }

                  // Clean up the match result
                  matchResult = matchResult
                    .replace(/\d+\/\d+/g, '')  // Remove scores
                    .replace(/\d{4}/g, '')      // Remove years
                    .replace(/[.,;]$/, '')       // Remove trailing punctuation
                    .replace(/\s+/g, ' ')       // Normalize spaces
                    .trim();

                  stats[format][field] = {
                    score: scoreText,
                    date: date,
                    year: year,
                    teams: teams,
                    matchResult: matchResult
                  };

                  // If we found a score, no need to check other sections
                  if (scoreText) break;

                  // If we found a score, no need to check other sections
                  if (scoreText) break;
                }
              }
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('Error extracting stats:', error.message);
  }

  // Ensure all formats have at least an empty object with basic info
  if (Object.keys(stats.test).length === 0) stats.test = getEmptyStats('test');
  if (Object.keys(stats.odi).length === 0) stats.odi = getEmptyStats('odi');
  if (Object.keys(stats.t20).length === 0) stats.t20 = getEmptyStats('t20');

  return stats;
}

/**
 * Extracts statistics from individual stat cards on the page
 */
function extractStatsFromIndividualCards($, stats) {
  // Find all stat cards
  const $statCards = $('.stat-card, [class*="stat-card"], .stat-item, [class*="stat-item"]');

  if ($statCards.length === 0) {
    return; // No stat cards found
  }

  // Process each stat card
  $statCards.each((i, card) => {
    const $card = $(card);
    const cardText = $card.text().toLowerCase();

    // Determine the format and stat type
    let format = '';
    let statType = '';

    // Determine format
    if (cardText.includes('test') || cardText.includes('tests')) {
      format = 'test';
    } else if (cardText.includes('odi') || cardText.includes('one day')) {
      format = 'odi';
    } else if (cardText.includes('t20') || cardText.includes('twenty20') || cardText.includes('t20i')) {
      format = 't20';
    } else {
      // If format not specified, try to determine from context
      if (cardText.includes('test')) format = 'test';
      else if (cardText.includes('odi')) format = 'odi';
      else if (cardText.includes('t20')) format = 't20';
    }

    if (!format) return; // Skip if we can't determine the format

    // Determine stat type
    if (cardText.includes('highest team score') || cardText.includes('highest total')) {
      statType = 'highestTeamScore';
    } else if (cardText.includes('lowest team score') || cardText.includes('lowest total')) {
      statType = 'lowestTeamScore';
    } else if (cardText.includes('highest individual score') || cardText.includes('best batting')) {
      statType = 'highestIndividualScore';
    } else if (cardText.includes('best bowling') || cardText.includes('best figures')) {
      statType = 'bestBowling';
    } else if (cardText.includes('most runs') || cardText.includes('leading run scorer')) {
      statType = 'mostRuns';
    } else if (cardText.includes('most wickets') || cardText.includes('leading wicket taker')) {
      statType = 'mostWickets';
    } else if (cardText.includes('most hundreds') || cardText.includes('most centuries')) {
      statType = 'mostHundreds';
    } else if (cardText.includes('most fifties') || cardText.includes('most half-centuries')) {
      statType = 'mostFifties';
    } else if (cardText.includes('5-wicket') || cardText.includes('five-wicket')) {
      statType = 'mostFiveWickets';
    } else if (cardText.includes('highest successful chase')) {
      statType = 'highestSuccessfulRunChase';
    } else if (cardText.includes('lowest defended total')) {
      statType = 'lowestDefendedTotal';
    } else if (cardText.includes('total matches') || cardText.includes('matches played')) {
      statType = 'totalMatches';
    }

    if (!statType) return; // Skip if we can't determine the stat type

    // Extract the value (this might need adjustment based on actual HTML structure)
    let value = $card.find('.stat-value, .value, [class*="value"], .number, [class*="number"]').first().text().trim();

    // If no value found, try to extract from the main card text
    if (!value) {
      // This is a simple approach - might need refinement based on actual HTML
      const text = $card.text().trim();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      if (lines.length > 1) {
        value = lines[1]; // Assuming value is on the second line
      } else {
        value = text.replace(statType, '').replace(format, '').replace(/[^0-9/\s]/g, ' ').trim();
      }
    }

    // Clean up the value
    value = value.replace(/\s+/g, ' ').trim();

    // Store the value if we found one
    if (value) {
      // Initialize the format object if it doesn't exist
      if (!stats[format]) stats[format] = {};
      stats[format][statType] = value;
    }
  });
}

/**
 * Extracts stats from a section by looking for common stat patterns
 */
function extractStatsFromSection($, $section) {
  const stats = {};

  // First, try to find all stat items in the section
  const $statItems = $section.find('.stat-item, .stat-card, [class*="stat-"]');

  if ($statItems.length > 0) {
    // Process each stat item
    $statItems.each((i, item) => {
      const $item = $(item);
      const itemText = $item.text().toLowerCase().trim();

      // Extract the stat type and value
      const $label = $item.find('.stat-label, .label, [class*="label"], .title, [class*="title"]').first();
      const $value = $item.find('.stat-value, .value, [class*="value"], .number, [class*="number"]').first();

      if ($label.length && $value.length) {
        const label = $label.text().toLowerCase().trim();
        const value = $value.text().trim();

        // Map the label to a stat key
        const statKey = mapLabelToStatKey(label);
        if (statKey && value) {
          stats[statKey] = value;
        }
      } else if (itemText) {
        // If we don't have separate label and value elements, try to parse the text
        const lines = itemText.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length >= 2) {
          const label = lines[0].toLowerCase();
          const value = lines.slice(1).join(' ').trim();
          const statKey = mapLabelToStatKey(label);
          if (statKey && value) {
            stats[statKey] = value;
          }
        }
      }
    });
  } else {
    // Fallback to pattern matching if no explicit stat items found
    const statPatterns = [
      { key: 'totalMatches', patterns: ['total matches', 'matches', 'total', 'matches played'] },
      { key: 'highestTeamScore', patterns: ['highest team score', 'highest total', 'highest innings', 'highest score'] },
      { key: 'lowestTeamScore', patterns: ['lowest team score', 'lowest total', 'lowest innings', 'lowest score'] },
      { key: 'highestIndividualScore', patterns: ['highest individual score', 'highest score by batsman', 'best batting'] },
      { key: 'bestBowling', patterns: ['best bowling', 'best bowling figures', 'best figures', 'best bowling in an innings'] },
      { key: 'mostRuns', patterns: ['most runs', 'leading run scorer', 'runs scored'] },
      { key: 'mostWickets', patterns: ['most wickets', 'leading wicket taker', 'wickets taken'] },
      { key: 'mostHundreds', patterns: ['most hundreds', 'most centuries', 'hundreds scored'] },
      { key: 'mostFifties', patterns: ['most fifties', 'most half-centuries', 'fifties scored'] },
      { key: 'mostFiveWickets', patterns: ['5-wicket hauls', 'five-wicket hauls', '5+ wickets in an innings'] },
      { key: 'highestSuccessfulRunChase', patterns: ['highest successful chase', 'highest run chase', 'highest target chased'] },
      { key: 'lowestDefendedTotal', patterns: ['lowest defended total', 'lowest total defended', 'lowest target defended'] },
      { key: 'averageFirstInningsScore', patterns: ['average 1st innings score', 'average first innings', '1st innings average'] },
      { key: 'matchesWonBattingFirst', patterns: ['matches won batting first', 'won batting first', 'batting first wins'] },
      { key: 'matchesWonBowlingFirst', patterns: ['matches won bowling first', 'won bowling first', 'bowling first wins'] },
      { key: 'matchesDrawn', patterns: ['matches drawn', 'drawn matches', 'draws'] },
      { key: 'matchesTied', patterns: ['matches tied', 'tied matches', 'ties'] },
      { key: 'mostCatches', patterns: ['most catches', 'catches taken', 'most catches by fielder'] },
      { key: 'mostDismissals', patterns: ['most dismissals', 'wicket-keeping dismissals', 'most dismissals by keeper'] }
    ];

    // Look for each stat in the section
    statPatterns.forEach(stat => {
      const found = findStatInSection($section, stat.patterns);
      if (found) {
        stats[stat.key] = found;
      }
    });
  }

  return stats;
}

/**
 * Maps a label to a stat key
 */
function mapLabelToStatKey(label) {
  const labelToKey = {
    'matches': 'totalMatches',
    'total matches': 'totalMatches',
    'matches played': 'totalMatches',
    'highest team score': 'highestTeamScore',
    'highest total': 'highestTeamScore',
    'highest innings': 'highestTeamScore',
    'lowest team score': 'lowestTeamScore',
    'lowest total': 'lowestTeamScore',
    'lowest innings': 'lowestTeamScore',
    'highest individual score': 'highestIndividualScore',
    'best batting': 'highestIndividualScore',
    'best bowling': 'bestBowling',
    'best bowling figures': 'bestBowling',
    'most runs': 'mostRuns',
    'leading run scorer': 'mostRuns',
    'most wickets': 'mostWickets',
    'leading wicket taker': 'mostWickets',
    'most hundreds': 'mostHundreds',
    'most centuries': 'mostHundreds',
    'most fifties': 'mostFifties',
    'most half-centuries': 'mostFifties',
    '5-wicket hauls': 'mostFiveWickets',
    'five-wicket hauls': 'mostFiveWickets',
    'highest successful chase': 'highestSuccessfulRunChase',
    'highest run chase': 'highestSuccessfulRunChase',
    'lowest defended total': 'lowestDefendedTotal',
    'average 1st innings score': 'averageFirstInningsScore',
    'average first innings': 'averageFirstInningsScore',
    'matches won batting first': 'matchesWonBattingFirst',
    'won batting first': 'matchesWonBattingFirst',
    'matches won bowling first': 'matchesWonBowlingFirst',
    'won bowling first': 'matchesWonBowlingFirst',
    'matches drawn': 'matchesDrawn',
    'drawn matches': 'matchesDrawn',
    'matches tied': 'matchesTied',
    'tied matches': 'matchesTied',
    'most catches': 'mostCatches',
    'most dismissals': 'mostDismissals'
  };

  // Try to find a matching key
  for (const [pattern, key] of Object.entries(labelToKey)) {
    if (label.includes(pattern)) {
      return key;
    }
  }

  return null;
}

/**
 * Finds a stat in a section by matching patterns
 * @param {jQuery} $section - The jQuery element to search within
 * @param {string[]} patterns - Patterns to match against
 * @returns {string|null} - The found stat value or null if not found
 */
function findStatInSection($section, patterns) {
  // If no patterns provided, try to find any stat-like elements
  if (!patterns || patterns.length === 0) {
    return findStatInElement($section).value || null;
  }

  // For each pattern, try to find a matching stat
  for (const pattern of patterns) {
    // Look for elements containing the pattern
    const $label = $section.find(`*:contains('${pattern}')`).filter((i, el) => {
      const text = $(el).text().toLowerCase().trim();
      return text === pattern || text.includes(pattern);
    }).first();

    if ($label.length) {
      // Try to find the value near the label
      let $value = $label.next();
      if ($value.length && $value.text().trim()) {
        return $value.text().trim();
      }

      // Try parent's next sibling
      $value = $label.parent().next();
      if ($value.length && $value.text().trim()) {
        return $value.text().trim();
      }

      // Try to find a number in the same element
      const text = $label.text().trim();
      const numberMatch = text.match(/\d+/);
      if (numberMatch) {
        return numberMatch[0];
      }
    }
  }

  // If not found by label, try to find in tables or lists
  const elementText = $section.text().toLowerCase();
  for (const pattern of patterns) {
    if (elementText.includes(pattern)) {
      // Try to find a number near the pattern in the text
      const regex = new RegExp(`${pattern}[^\\d]*([\\d,./]+)`, 'i');
      const match = elementText.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  return null;
}

/**
 * Extracts stats for a specific format from the page
 * Returns empty stats if no data is found
 */
function extractFormatStats($, format) {
  const stats = {};
  const formatClass = format.toLowerCase();

  // Try different selectors to find the format section
  const $formatSection = $(`.${formatClass}-stats, .${formatClass}-section, [data-format*="${formatClass}"], [class*="${formatClass}"]`)
    .filter((i, el) => {
      // Filter to only include elements that are likely to be format sections
      const text = $(el).text().toLowerCase();
      return text.includes(formatClass) ||
        text.includes('matches') ||
        text.includes('runs') ||
        text.includes('wickets');
    })
    .first();

  // If we found a format section, extract stats from it
  if ($formatSection.length > 0) {
    // Extract total matches
    const totalMatches = findStatInElement($formatSection, ['total matches', 'matches', 'total']);
    if (totalMatches) stats.totalMatches = totalMatches;

    // Dynamically extract all stat items from the section
    const $statItems = $formatSection.find('[class*="stat"], [class*="item"]').filter((i, el) => {
      // Filter out elements that are likely containers rather than individual stat items
      const $el = $(el);
      const text = $el.text().trim();
      return text && text.length > 0 && text.length < 100; // Arbitrary length to filter out large containers
    });

    if ($statItems.length > 0) {
      // Group items that are likely related (e.g., label and value pairs)
      const statGroups = [];
      let currentGroup = [];

      $statItems.each((i, el) => {
        const $el = $(el);
        const text = $el.text().trim();

        // If this element looks like a label (contains letters but few numbers)
        const isLabel = /[a-zA-Z]/.test(text) && !/\d{3,}/.test(text);

        if (isLabel) {
          // If we already have a group, save it and start a new one
          if (currentGroup.length > 0) {
            statGroups.push([...currentGroup]);
            currentGroup = [];
          }
        }

        currentGroup.push($el);
      });

      // Add the last group if not empty
      if (currentGroup.length > 0) {
        statGroups.push([...currentGroup]);
      }

      // Process each group to extract stat key-value pairs
      statGroups.forEach(group => {
        if (group.length >= 2) {
          // Assume first element is the label, second is the value
          const $label = group[0];
          const $value = group[1];

          const labelText = $label.text().trim().toLowerCase();
          const valueText = $value.text().trim();

          if (labelText && valueText) {
            // Create a clean key from the label text
            const key = labelText
              .replace(/[^a-z0-9\s]/g, '') // Remove special chars
              .replace(/\s+/g, ' ')         // Collapse multiple spaces
              .trim()
              .replace(/\s+/g, '_');        // Convert spaces to underscores

            if (key && valueText) {
              stats[key] = valueText;
            }
          }
        } else if (group.length === 1) {
          // If only one element, try to split it into label and value
          const $el = group[0];
          const text = $el.text().trim();

          // Try to split on common separators
          const separators = [':', '•', '·', '|', '-'];
          for (const sep of separators) {
            if (text.includes(sep)) {
              const [labelPart, ...valueParts] = text.split(sep);
              const labelText = labelPart.trim().toLowerCase();
              const valueText = valueParts.join(sep).trim();

              if (labelText && valueText) {
                const key = labelText
                  .replace(/[^a-z0-9\s]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .replace(/\s+/g, '_');

                if (key) {
                  stats[key] = valueText;
                }
              }
              break;
            }
          }
        }
      });
    }

    // If we found at least one stat, return them
    if (Object.keys(stats).length > 0) {
      return stats;
    }
  }

  // If no format section found or no stats extracted, try to find stats in the main page
  const mainPageStats = extractStatsFromSection($, $('body'));
  if (mainPageStats && Object.keys(mainPageStats).length > 0) {
    return mainPageStats;
  }

  // If still no stats found, return empty stats for this format
  return getEmptyStats(format);
}

/**
 * Extracts detailed match information including first/recent matches and highest/lowest scores
 */
function extractDetailedMatchInfo($, stats) {
  // Find all format sections (Test, ODI, T20)
  const $formatSections = $('div.grid > section.bg-foreGround');

  if ($formatSections.length === 0) {
    return; // No format sections found
  }

  // Process each format section
  $formatSections.each((i, section) => {
    const $section = $(section);
    const sectionText = $section.text();

    // Determine the format (Test, ODI, T20)
    let format = '';
    if (sectionText.includes('ODI')) {
      format = 'odi';
    } else if (sectionText.includes('T20') || sectionText.includes('Twenty20')) {
      format = 't20';
    } else if (sectionText.includes('Test')) {
      format = 'test';
    } else {
      return; // Skip if not a recognized format
    }

    // Initialize format stats if not already present
    if (!stats[format]) stats[format] = {};

    // Extract first match
    const firstMatch = extractMatchInfo($, $section, 'first');
    if (firstMatch) {
      stats[format][`first${format.charAt(0).toUpperCase() + format.slice(1)}`] = firstMatch;
    }

    // Extract most recent match
    const recentMatch = extractMatchInfo($, $section, 'recent');
    if (recentMatch) {
      stats[format][`recent${format.charAt(0).toUpperCase() + format.slice(1)}`] = recentMatch;
    }

    // Extract highest team score (this will be handled by the next section)
  });

  // Now process the highest/lowest scores sections
  const $scoreSections = $('div.grid > section.bg-foreGround');
  $scoreSections.each((i, section) => {
    const $section = $(section);
    const sectionText = $section.text();

    // Determine the format based on the content
    let format = '';
    if (sectionText.includes('ODI')) {
      format = 'odi';
    } else if (sectionText.includes('T20') || sectionText.includes('Twenty20')) {
      format = 't20';
    } else if (sectionText.includes('Test')) {
      format = 'test';
    } else {
      return; // Skip if not a recognized format
    }

    // Initialize format stats if not already present
    if (!stats[format]) stats[format] = {};

    // Extract highest team score
    if (sectionText.includes('Highest Team Score')) {
      const highestScore = extractScoreInfo($, $section, 'highest');
      if (highestScore) {
        stats[format]['highestTeamScore'] = highestScore;
      }
    }

    // Extract lowest team score
    if (sectionText.includes('Lowest Team Score')) {
      const lowestScore = extractScoreInfo($, $section, 'lowest');
      if (lowestScore) {
        stats[format]['lowestTeamScore'] = lowestScore;
      }
    }
  });
}

/**
 * Extracts match information (first or recent)
 */
function extractMatchInfo($, $section, type) {
  // Find the section header that matches the type (e.g., "1st ODI", "Recent ODI")
  const typeText = type === 'first' ? '1st' : 'Recent';
  const $header = $section.find('h2').filter((i, el) =>
    $(el).text().includes(typeText)
  );

  if ($header.length === 0) return null;

  // Get the parent section
  const $matchSection = $header.closest('section');

  // Extract date and teams/result from the section
  const $dateElement = $matchSection.find('p.text-text-header').first();
  const dateText = $dateElement.text().trim();

  // Extract teams and result from the span
  const $infoSpan = $matchSection.find('span.flex.flex-col');
  const teams = $infoSpan.find('p').first().text().trim();
  let matchResult = $infoSpan.find('p').eq(1).text().trim();

  // Remove date from match result if it exists
  if (matchResult.includes(' - ')) {
    matchResult = matchResult.split(' - ').slice(1).join(' - ').trim();
  }

  // Extract year from date text
  const yearMatch = dateText.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : '';

  return {
    date: dateText,
    year: year,
    teams: teams,
    matchResult: matchResult
  };
}

/**
 * Extracts score information (highest or lowest)
 */
/**
 * Extracts stats from individual stat cards when format sections aren't available
 */
function extractStatsFromIndividualCards($, stats) {
  try {
    // First, find all format sections
    const formatSections = [];

    // Find all format sections (Test, ODI, T20)
    $('section, .stat-card, .stat-item').each((i, section) => {
      const $section = $(section);
      const sectionText = $section.text().toLowerCase();

      // Determine the format (Test, ODI, T20)
      let format = '';
      if (sectionText.includes('test')) {
        format = 'test';
      } else if (sectionText.includes('odi')) {
        format = 'odi';
      } else if (sectionText.includes('t20') || sectionText.includes('twenty20')) {
        format = 't20';
      }

      if (format) {
        formatSections.push({
          $section: $section,
          format: format
        });
      }
    });

    // Process each format section
    formatSections.forEach(({ $section, format }) => {
      // Initialize format if not exists
      if (!stats[format]) {
        stats[format] = getEmptyStats(format);
      }

      // Find all score sections within this format section
      const scoreSections = $section.find('section, .stat-card, .stat-item');

      scoreSections.each((i, scoreSection) => {
        const $scoreSection = $(scoreSection);
        const sectionText = $scoreSection.text().toLowerCase();

        // Check for highest/lowest scores
        if (sectionText.includes('highest team score') || sectionText.includes('lowest team score')) {
          const isHighest = sectionText.includes('highest');
          const statType = isHighest ? 'highestTeamScore' : 'lowestTeamScore';

          // Skip if we already have this stat
          if (stats[format][statType]?.score) return;

          // Extract score
          let score = '';
          const $scoreElement = $scoreSection.find('.stat-value, .value, .score, [class*="score"], [class*="value"]').first();
          if ($scoreElement.length) {
            score = $scoreElement.text().trim();
          } else {
            const scoreMatch = sectionText.match(/(\d+\/\d+)/);
            score = scoreMatch ? scoreMatch[0] : '';
          }

          // Extract details
          let details = $scoreSection.find('.stat-details, .details, [class*="detail"], [class*="match"]').first().text().trim();
          if (!details) {
            details = $scoreSection.text().replace(score, '').trim();
          }

          // Extract teams and date
          let teams = '';
          let matchResult = '';
          let date = '';
          let year = '';

          // Try to find team names
          const $teamsElement = $scoreSection.find('.flex.flex-col.text-text-header, .teams, .match-teams');
          if ($teamsElement.length) {
            const teamLines = [];
            $teamsElement.find('p, span').each((i, el) => {
              const text = $(el).text().trim();
              if (text && !text.match(/^\d+\/\d+/) && !text.match(/^by [A-Za-z]+ on/)) {
                teamLines.push(text);
              }
            });

            if (teamLines.length > 0) {
              // First line is usually the teams
              teams = teamLines[0].replace(/\s+/g, ' ').trim();

              // Find the match result
              const resultLine = teamLines.find(line =>
                line.match(/beat|won by|defeated|drew with|tied with/i)
              );

              if (resultLine) {
                matchResult = resultLine
                  .replace(/\d+\/\d+/g, '')
                  .replace(/\d{4}/g, '')
                  .replace(/- by .+$/, '')
                  .replace(/\s+/g, ' ')
                  .trim();
              } else if (teamLines.length > 1) {
                matchResult = teamLines[1]
                  .replace(/\d+\/\d+/g, '')
                  .replace(/\d{4}/g, '')
                  .replace(/- by .+$/, '')
                  .replace(/\s+/g, ' ')
                  .trim();
              }
            }
          }

          // Extract date and clean it up
          const dateMatch = details.match(/([A-Za-z]+ \d{1,2}, \d{4})/);
          date = dateMatch ? dateMatch[0].replace(/^Score\s*/i, '').trim() : '';

          // Extract year from date
          const yearMatch = date.match(/(\d{4})/);
          year = yearMatch ? yearMatch[1] : '';

          // Update the stats
          stats[format][statType] = {
            score: score,
            date: date,
            year: year,
            teams: teams,
            matchResult: matchResult
          };
        }
      });
    });

  } catch (error) {
    console.error('Error extracting stats from individual cards:', error.message);
  }
}

/**
 * Extracts score information (highest or lowest)
 */
function extractScoreInfo($, $section, type) {
  try {
    // First try to find the score in the section
    const score = findStatInPage($, $section, type === 'highest' ? 'highestTeamScore' : 'lowestTeamScore');
    if (score) return score;

    // Fallback to direct extraction
    const $scoreCards = $section.find('div.flex.flex-col.items-center.justify-center');
    if ($scoreCards.length === 0) return null;

    const $scoreCard = $($scoreCards[0]);
    const scoreText = $scoreCard.find('p').first().text().trim();

    let teamText = '';
    let matchResult = '';

    if ($scoreCards.length > 1) {
      const $infoCard = $($scoreCards[1]);
      teamText = $infoCard.find('p').first().text().trim();
      matchResult = $infoCard.find('p').last().text().trim();
    }

    let dateText = $section.find('p.text-text-header').first().text().trim();
    // Clean up date text by removing 'Score' prefix if it exists
    dateText = dateText.replace(/^Score\s*/i, '').trim();
    const yearMatch = dateText.match(/(\d{4})/);
    const year = yearMatch ? yearMatch[1] : '';

    let cleanMatchResult = matchResult;
    if (matchResult.includes('- ')) {
      cleanMatchResult = matchResult.split('- ').pop().trim();
    }

    return {
      score: scoreText,
      date: dateText,
      year: year,
      teams: teamText,
      matchResult: cleanMatchResult
    };
  } catch (error) {
    console.error(`Error extracting ${type} score:`, error.message);
    return null;
  }
}

/**
 * Helper to extract match details using flexible selectors
 */
function extractMatchDetail($element, type) {
  const selectors = {
    date: ['.date', '.match-date', '[class*="date"]', 'time'],
    year: ['.year', '.match-year', '[class*="year"]'],
    teams: ['.teams', '.team-names', '.match-teams', '[class*="team"]'],
    team: ['.team', '.team-name', '[class*="team" i]'],
    result: ['.result', '.match-result', '.summary', '[class*="result"]'],
    score: ['.score', '.team-score', '[class*="score"]']
  };

  const typeSelectors = selectors[type] || [];

  for (const selector of typeSelectors) {
    const $el = $element.find(selector).first();
    if ($el.length) {
      const text = $el.text().trim();
      if (text) return text;
    }
  }

  // If not found with selectors, try to find in the element's text
  const text = $element.text();
  if (type === 'date' && /\d{1,2}[\s\/.-]\w+[\s\/.-]\d{4}/.test(text)) {
    return text.match(/\d{1,2}[\s\/.-]\w+[\s\/.-]\d{4}/)[0];
  }

  if (type === 'year' && /\b(19|20)\d{2}\b/.test(text)) {
    return text.match(/\b(19|20)\d{2}\b/)[0];
  }

  if (type === 'score' && /\d+\/\d+/.test(text)) {
    return text.match(/\d+\/\d+/)[0];
  }

  return null;
}

// Selectors for different stats by format
const formatSelectors = {
  test: {
    totalMatches: ['test-matches', 'tests', 'test-matches-played'],
    highestTeamScore: ['test-highest-score', 'test-highest-innings'],
    // ... add more selectors
  },
  odi: {
    totalMatches: ['odi-matches', 'odis', 'odi-matches-played'],
    highestTeamScore: ['odi-highest-score', 'odi-highest-innings'],
    // ... add more selectors
  },
  t20: {
    totalMatches: ['t20-matches', 't20is', 't20-matches-played'],
    highestTeamScore: ['t20-highest-score', 't20-highest-innings'],
    // ... add more selectors
  }
};

/**
 * Finds a stat in the page by trying multiple selectors
 */
function findStatInPage($, selectors) {
  for (const selector of selectors) {
    // Try exact class match
    let $element = $(`.${selector}`).first();
    if ($element.length) return $element.text().trim();

    // Try contains text
    $element = $(`*:contains('${selector}')`).filter((i, el) => {
      return $(el).text().toLowerCase().includes(selector);
    }).first();

    if ($element.length) {
      // Try to get the next element or sibling
      return $element.next().text().trim() ||
        $element.parent().next().text().trim() ||
        $element.closest('tr').find('td').last().text().trim();
    }
  }

  return '';
}

/**
 * Returns an empty stats object for a given format
 */
function getEmptyStats(format) {
  const currentYear = new Date().getFullYear().toString();
  const formatName = format.toUpperCase();

  return {
    [`first${format.charAt(0).toUpperCase() + format.slice(1)}`]: {
      date: '',
      year: '',
      teams: '',
      matchResult: ''
    },
    [`recent${format.charAt(0).toUpperCase() + format.slice(1)}`]: {
      date: '',
      year: currentYear,
      teams: '',
      matchResult: ''
    },
    highestTeamScore: {
      score: '',
      date: '',
      year: '',
      teams: '',
      matchResult: ''
    },
    lowestTeamScore: {
      score: '',
      date: '',
      year: '',
      teams: '',
      matchResult: ''
    }
  };
}

module.exports = {
  scrapeCricketDotComVenue,
  extractVenueName,
  extractVenueInfo,
  extractCricketStats,
  getEmptyStats
};
