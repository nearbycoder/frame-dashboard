// Live data starts empty. Connection failures never substitute sample entries.
window.DATA = {
  people: [], ALL: [], family: { id: 'family', name: 'Calendar', color: '#3b82f6', rgb: '59 130 246', ink: '#FFFFFF' },
  sources: [], events: [],
  routines: [{ id: 'today', name: 'Today', range: 'Today', from: 0, to: 24 }],
  chores: [], stars: {}, week: {}, groceries: [], stores: [], catalog: [], usuals: [],
  catOrder: { all: ['Produce', 'Dairy & eggs', 'Meat & seafood', 'Pantry', 'Frozen', 'Snacks', 'Drinks', 'Household', 'Other'] },
  weather: null, photos: []
};
