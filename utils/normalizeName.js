function normalizeName(name) {
  if (!name || name === 'Unknown Venue') {
    // Generate a unique ID for unknown venues to prevent file conflicts
    return `venue_${Date.now()}`;
  }

  // First, clean the name but keep spaces and some special characters
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Keep letters, numbers, spaces, and hyphens
    .replace(/\s+/g, ' ')         // Replace multiple spaces with single space
    .trim();

  // If the name is too short, add a timestamp to prevent conflicts
  if (normalized.length < 3) {
    normalized = `${normalized}_${Date.now()}`;
  }

  // Ensure the name is URL-safe
  return normalized
    .replace(/\s+/g, '-')  // Replace spaces with hyphens
    .replace(/--+/g, '-')  // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

module.exports = normalizeName;