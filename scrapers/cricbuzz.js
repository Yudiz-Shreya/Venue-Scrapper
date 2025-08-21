const axios = require('axios');
const cheerio = require('cheerio');

// Function to scrape detailed match info from Cricbuzz match page
async function scrapeMatchDetails(matchUrl) {
  try {
    const { data } = await axios.get(matchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(data);

    // Extract and clean match title
    let rawTitle = $('h1, .cb-nav-main h4, .cb-nav-hdr').first().text().trim();
    // Remove "Live Cricket Score, Commentary" and similar suffixes
    const cleanTitle = rawTitle
      .replace(/\s*-\s*Live Cricket Score.*$/i, '')
      .replace(/\s*Live Cricket Score.*$/i, '')
      .replace(/\s*Commentary.*$/i, '')
      .replace(/\s*Scorecard.*$/i, '')
      .trim();

    const matchDetails = {
      url: matchUrl,
      title: cleanTitle,
      series: $('.cb-nav-subhdr, .cb-series-brcrumb, .cb-nav-subhdr').first().text().trim(),
      result: $('.cb-min-stts, .cb-text-complete, .cb-text-live, .cb-text-gray, .cb-nav-subhdr').first().text().trim(),
      teams: [],
      scores: [],
      innings: [],
      matchInfo: {}
    };

    // Extract match info from various possible locations
    $('.cb-mat-info, .cb-mtch-info, .cb-nav-subhdr').each((_, infoDiv) => {
      const infoText = $(infoDiv).text();

      // Extract full date with year - improved pattern
      const fullDateMatch = infoText.match(/(\w{3}\s+\d{1,2}-\w{3}\s+\d{1,2},?\s+\d{4}|\w{3}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w{3}\s+\d{4})/i);
      if (fullDateMatch && !fullDateMatch[0].includes('dia')) {
        matchDetails.matchInfo.date = fullDateMatch[0];
      } else {
        // Fallback to partial date - more specific pattern
        const dateMatch = infoText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
        if (dateMatch && !dateMatch[0].includes('dia')) {
          matchDetails.matchInfo.date = dateMatch[0];
        }
      }

      // Extract venue
      const venueMatch = infoText.match(/Venue:\s*([^,]+)/i);
      if (venueMatch) {
        matchDetails.matchInfo.venue = venueMatch[1].trim();
      }

      // Extract time
      const timeMatch = infoText.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (timeMatch) {
        matchDetails.matchInfo.time = timeMatch[0];
      }

      // Extract year from series info if not in date
      if (!matchDetails.matchInfo.date.includes('20')) {
        const yearMatch = infoText.match(/(20\d{2})/i);
        if (yearMatch) {
          matchDetails.matchInfo.year = yearMatch[0];
        }
      }
    });

    // Extract team scores and innings - try multiple approaches

    // Approach 1: Look for scorecard tables
    $('table').each((_, table) => {
      const tableText = $(table).text();
      if (tableText.includes('Innings') || tableText.includes('Score') || tableText.includes('Overs')) {
        $(table).find('tr').each((_, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 2) {
            const teamText = cells.eq(0).text().trim();
            const scoreText = cells.eq(1).text().trim();

            // Check if this looks like a team score
            if (teamText.match(/^[A-Z]{2,4}$|India|England|Australia|Pakistan|Sri Lanka|New Zealand|South Africa|West Indies|Bangladesh|Afghanistan|Zimbabwe/) &&
              scoreText.match(/\d+\/\d+|\d+\*?\s*\(\d+/)) {

              if (!matchDetails.teams.includes(teamText)) {
                matchDetails.teams.push(teamText);
                matchDetails.scores.push(scoreText);

                const innings = {
                  team: teamText,
                  score: scoreText,
                  overs: scoreText.match(/\((\d+\.?\d*\s*[Oo]v)/)?.[1] || '',
                  runRate: scoreText.match(/RR:\s*(\d+\.\d+)/)?.[1] || ''
                };

                matchDetails.innings.push(innings);
              }
            }
          }
        });
      }
    });

    // Approach 2: Look for specific scorecard elements
    $('.cb-scrd-itms, .cb-min-bat-rw').each((_, scorecard) => {
      const teamName = $(scorecard).find('.cb-bat-team, .cb-ovr-flo').first().text().trim();
      const score = $(scorecard).find('.cb-font-20').first().text().trim();

      if (teamName && score && teamName.length < 50 && score.match(/\d/)) {
        if (!matchDetails.teams.includes(teamName)) {
          matchDetails.teams.push(teamName);
          matchDetails.scores.push(score);

          const innings = {
            team: teamName,
            score: score,
            overs: $(scorecard).find('.cb-font-12').filter((_, el) => $(el).text().includes('Ov')).first().text().trim(),
            runRate: $(scorecard).find('.cb-font-12').filter((_, el) => $(el).text().includes('RR')).first().text().trim()
          };

          matchDetails.innings.push(innings);
        }
      }
    });



    return matchDetails;
  } catch (error) {
    return error;
  }
}

async function scrapeCricbuzzVenue(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const $ = cheerio.load(data);
    const venueInfo = {};
    const stats = {};

    // 📌 Extract metadata (label-value pairs)
    $('table tr').each((i, row) => {
      const label = $(row).find('td').eq(0).text().trim();
      const value = $(row).find('td').eq(1).text().trim();
      if (label && value) {
        venueInfo[label] = value;
      }
    });

    // 📌 Extract venue name from multiple selectors
    const nameSelectors = [
      'h1',
      '.cb-nav-hdr',
      '.cb-font-24',
      '.cb-font-20',
      'p.text-text-header\/60.md\:text-sm.text-xs.font-semibold'
    ];

    for (const selector of nameSelectors) {
      const nameText = $(selector).first().text().trim();
      if (nameText && nameText.length > 3 && nameText.length < 100) {
        venueInfo['Name'] = nameText;
        break;
      }
    }

    // 📌 Extract stats per format - Look for format headers and their tables
    let currentFormat = null;

    // Initialize all formats
    stats.test = {};
    stats.odi = {};
    stats.t20 = {};

    // Find all elements and look for format indicators
    $('*').each((_, element) => {
      const text = $(element).text().trim().toLowerCase();

      // Check for format headers with more flexible matching
      if (text.includes('test') && (text.includes('stats') || text.includes('matches') || text.includes('record'))) {
        currentFormat = 'test';
      } else if (text.includes('odi') && (text.includes('stats') || text.includes('matches') || text.includes('record'))) {
        currentFormat = 'odi';
      } else if ((text.includes('t20') || text.includes('twenty')) && (text.includes('stats') || text.includes('matches') || text.includes('record'))) {
        currentFormat = 't20';
      }

      // Also check for specific format indicators in headers
      if ($(element).is('h1, h2, h3, h4, .cb-font-18, .cb-font-16')) {
        if (text.includes('test')) currentFormat = 'test';
        else if (text.includes('odi')) currentFormat = 'odi';
        else if (text.includes('t20') || text.includes('twenty')) currentFormat = 't20';
      }

      // If we're in a format section, look for stats tables
      if (currentFormat && $(element).is('table')) {
        $(element).find('tr').each((_, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 2) {
            const key = cells.eq(0).text().trim();
            const valueCell = cells.eq(1);
            const value = valueCell.text().trim();

            // Check if the value cell contains a clickable link
            const link = valueCell.find('a').attr('href');

            // Only include actual match statistics, not venue information
            if (key && value && !key.includes('STATS') && key !== 'by' &&
              // Include match statistics
              (key.toLowerCase().includes('matches') ||
                key.toLowerCase().includes('total') ||
                key.toLowerCase().includes('average') ||
                key.toLowerCase().includes('highest') ||
                key.toLowerCase().includes('lowest') ||
                key.toLowerCase().includes('won') ||
                key.toLowerCase().includes('score') ||
                key.toLowerCase().includes('defended') ||
                key.toLowerCase().includes('chased')) &&
              // Exclude venue information
              !key.toLowerCase().includes('opened') &&
              !key.toLowerCase().includes('capacity') &&
              !key.toLowerCase().includes('ends') &&
              !key.toLowerCase().includes('location') &&
              !key.toLowerCase().includes('time zone') &&
              !key.toLowerCase().includes('home to') &&
              !key.toLowerCase().includes('floodlights') &&
              !key.toLowerCase().includes('curator') &&
              !key.toLowerCase().includes('known as')) {

              if (link) {
                // Store both the text and the link for detailed scraping
                stats[currentFormat][key] = {
                  text: value,
                  matchUrl: link.startsWith('http') ? link : `https://www.cricbuzz.com${link}`,
                  hasDetailedData: true
                };
              } else {
                stats[currentFormat][key] = value;
              }
            }
          }
        });
      }
    });

    // Alternative approach: Look for any stats tables and categorize them
    // Check if any format has empty stats and try to fill them
    const hasEmptyFormats = Object.keys(stats.test).length === 0 || Object.keys(stats.odi).length === 0 || Object.keys(stats.t20).length === 0;

    if (hasEmptyFormats) {
      $('table').each((_, table) => {
        const tableText = $(table).text().toLowerCase();

        // Try to determine format from table content or nearby text
        let format = null;
        const prevText = $(table).prev().text().toLowerCase();
        const nextText = $(table).next().text().toLowerCase();
        const parentText = $(table).parent().text().toLowerCase();
        const allText = (prevText + ' ' + nextText + ' ' + parentText + ' ' + tableText).toLowerCase();

        // More comprehensive format detection
        if (allText.includes('test') && (allText.includes('match') || allText.includes('record') || allText.includes('stat'))) {
          format = 'test';
        } else if (allText.includes('odi') && (allText.includes('match') || allText.includes('record') || allText.includes('stat'))) {
          format = 'odi';
        } else if ((allText.includes('t20') || allText.includes('twenty')) && (allText.includes('match') || allText.includes('record') || allText.includes('stat'))) {
          format = 't20';
        }

        // If we found a format, extract stats from this table
        if (format) {
          $(table).find('tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 2) {
              const key = cells.eq(0).text().trim();
              const valueCell = cells.eq(1);
              const value = valueCell.text().trim();

              // Check if the value cell contains a clickable link
              const link = valueCell.find('a').attr('href');

              // Only include actual match statistics, not venue information
              if (key && value &&
                (key.toLowerCase().includes('matches') ||
                  key.toLowerCase().includes('total') ||
                  key.toLowerCase().includes('average') ||
                  key.toLowerCase().includes('highest') ||
                  key.toLowerCase().includes('lowest') ||
                  key.toLowerCase().includes('won') ||
                  key.toLowerCase().includes('score') ||
                  key.toLowerCase().includes('defended') ||
                  key.toLowerCase().includes('chased')) &&
                // Exclude venue information
                !key.toLowerCase().includes('opened') &&
                !key.toLowerCase().includes('capacity') &&
                !key.toLowerCase().includes('ends') &&
                !key.toLowerCase().includes('location') &&
                !key.toLowerCase().includes('time zone') &&
                !key.toLowerCase().includes('home to') &&
                !key.toLowerCase().includes('floodlights') &&
                !key.toLowerCase().includes('curator') &&
                !key.toLowerCase().includes('known as')) {

                if (link) {
                  // Store both the text and the link for detailed scraping
                  stats[format][key] = {
                    text: value,
                    matchUrl: link.startsWith('http') ? link : `https://www.cricbuzz.com${link}`,
                    hasDetailedData: true
                  };
                } else {
                  stats[format][key] = value;
                }
              }
            }
          });
        }
      });
    }

    // 📌 Transform stats into the desired detailed format
    const finalStats = {};

    for (const format of ['test', 'odi', 't20']) {
      const formatStats = stats[format];
      if (!formatStats || Object.keys(formatStats).length === 0) continue;

      const transformed = {};

      // Define mapping from scraped keys to final keys
      const keyMapping = {
        'First': `first${format.charAt(0).toUpperCase() + format.slice(1)}`,
        'Recent': `recent${format.charAt(0).toUpperCase() + format.slice(1)}`,
        'Highest': 'highestTeamScore',
        'Lowest': 'lowestTeamScore',
      };

      // Find keys that match our mapping
      for (const scrapedKey in formatStats) {
        for (const mapKey in keyMapping) {
          // Use startsWith for a more flexible match that is still more precise than includes()
          if (scrapedKey.toLowerCase().trim().startsWith(mapKey.toLowerCase().trim())) {
            const finalKey = keyMapping[mapKey];
            const statValue = formatStats[scrapedKey];

            if (statValue && statValue.hasDetailedData) {
              try {
                const matchDetails = await scrapeMatchDetails(statValue.matchUrl);
                const seriesYear = matchDetails.series ? matchDetails.series.match(/\d{4}/) : null;
                const year = (matchDetails.matchInfo.date && matchDetails.matchInfo.date.match(/\d{4}/)
                  ? matchDetails.matchInfo.date.match(/\d{4}/)[0]
                  : matchDetails.matchInfo.year) || (seriesYear ? seriesYear[0] : null);
                const date = matchDetails.matchInfo.date ? matchDetails.matchInfo.date.replace(/, \d{4}/, '').replace(/\w{3}\s+\d{1,2}-/, '') : null;

                transformed[finalKey] = {
                  date: date,
                  year: year,
                  teams: matchDetails.title.split(',')[0].trim() || null,
                  matchResult: matchDetails.result && matchDetails.result.includes('{{premiumScreenName}}') ? '' : matchDetails.result || null
                };

                // Add score for highest/lowest stats
                if (finalKey.includes('Score')) {
                  transformed[finalKey].score = statValue.text.split(' ')[0];
                }
              } catch (e) {
                // If scraping details fails, store basic info
                transformed[finalKey] = { text: statValue.text };
              }
            } else {
              // For entries without a match URL
              transformed[finalKey] = { score: statValue };
            }
            break; // Move to the next scrapedKey once a match is found
          }
        }
      }
      if (Object.keys(transformed).length > 0) {
        finalStats[format] = transformed;
      }
    }

    venueInfo.stats = finalStats;

    // Remove unwanted summary fields from the final output
    const unwantedKeys = [
      'Total matches',
      'Matches won batting first',
      'Matches won bowling first',
      'Average 1st Inns scores',
      'Average 2nd Inns scores',
      'Average 3rd Inns scores',
      'Average 4th Inns scores',
      'Highest total recorded',
      'Lowest total recorded',
      'Highest score chased',
      'Lowest score defended'
    ];

    for (const key of unwantedKeys) {
      delete venueInfo[key];
    }

    return venueInfo;
  } catch (err) {
    console.error(`Error in scrapeCricbuzzVenue for ${url}:`, err);
    return {};
  }
}

module.exports = { scrapeCricbuzzVenue, scrapeMatchDetails };
