import { parsedRowsToGrid } from './gridHelpers'
import { DatasetVariableInfo, GridState } from '@/types'
import { MTCARS_HEADERS, MTCARS_META, MTCARS_ROWS } from './sampleMtcars'
import { OLD_FAITHFUL_HEADERS, OLD_FAITHFUL_META, OLD_FAITHFUL_ROWS } from './sampleOldFaithful'
import { IRIS_HEADERS, IRIS_META, IRIS_ROWS } from './sampleIris'
import { PENGUINS_HEADERS, PENGUINS_META, PENGUINS_ROWS } from './samplePenguins'
import { TITANIC_STUDENT_HEADERS, TITANIC_STUDENT_META, TITANIC_STUDENT_ROWS } from './sampleTitanic'

const ANSCOMBE_HEADERS = ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'x4', 'y4']
const ANSCOMBE_ROWS: unknown[][] = [
  [10, 8.04, 10, 9.14, 10, 7.46, 8, 6.58],
  [8, 6.95, 8, 8.14, 8, 6.77, 8, 5.76],
  [13, 7.58, 13, 8.74, 13, 12.74, 8, 7.71],
  [9, 8.81, 9, 8.77, 9, 7.11, 8, 8.84],
  [11, 8.33, 11, 9.26, 11, 7.81, 8, 8.47],
  [14, 9.96, 14, 8.10, 14, 8.84, 8, 7.04],
  [6, 7.24, 6, 6.13, 6, 6.08, 8, 5.25],
  [4, 4.26, 4, 3.10, 4, 5.39, 19, 12.50],
  [12, 10.84, 12, 9.13, 12, 8.15, 8, 5.56],
  [7, 4.82, 7, 7.26, 7, 6.42, 8, 7.91],
  [5, 5.68, 5, 4.74, 5, 5.73, 8, 6.89],
]

export interface SampleDataset {
  id?: string
  name: string
  emoji: string
  description?: string
  tags?: string[]
  source?: string
  sourceUrl?: string
  citation?: string
  notes?: string
  variableInfo?: DatasetVariableInfo[]
  grid: GridState
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    name: 'Titanic Passengers',
    emoji: '🚢',
    description: TITANIC_STUDENT_META.description,
    tags: [...TITANIC_STUDENT_META.tags],
    source: TITANIC_STUDENT_META.source,
    sourceUrl: TITANIC_STUDENT_META.sourceUrl,
    citation: TITANIC_STUDENT_META.citation,
    notes: TITANIC_STUDENT_META.notes,
    variableInfo: [
      { name: 'survived', description: 'Whether the passenger survived the disaster (Yes or No).' },
      { name: 'ticket_class', description: 'Passenger ticket class: First, Second, or Third.' },
      { name: 'sex', description: 'Passenger sex.' },
      { name: 'age', description: 'Passenger age in years. Some values are missing.' },
      { name: 'adult_child', description: 'Derived from age: Child if under 18, Adult if 18 or older. Blank when age is missing.' },
      { name: 'fare', description: 'Ticket fare in British pounds.' },
      { name: 'family_size', description: 'Total family-group size traveling together on the ship, including the passenger.' },
      { name: 'embarked', description: 'Port where the passenger boarded: Southampton, Cherbourg, or Queenstown.' },
    ],
    grid: parsedRowsToGrid([...TITANIC_STUDENT_HEADERS], TITANIC_STUDENT_ROWS.map(row => [...row] as unknown[])),
  },
  {
    id: 'sample:iris',
    name: 'Iris Flowers',
    emoji: '🌸',
    description: IRIS_META.description,
    tags: [...IRIS_META.tags],
    source: IRIS_META.source,
    sourceUrl: IRIS_META.sourceUrl,
    citation: IRIS_META.citation,
    notes: IRIS_META.notes,
    variableInfo: [
      { name: 'sepal_length', description: 'Sepal length in centimeters.' },
      { name: 'sepal_width', description: 'Sepal width in centimeters.' },
      { name: 'petal_length', description: 'Petal length in centimeters.' },
      { name: 'petal_width', description: 'Petal width in centimeters.' },
      { name: 'species', description: 'Iris species: Setosa, Versicolor, or Virginica.' },
    ],
    grid: parsedRowsToGrid([...IRIS_HEADERS], IRIS_ROWS.map(row => [...row] as unknown[])),
  },
  {
    name: 'Palmer Penguins',
    emoji: '🐧',
    description: PENGUINS_META.description,
    tags: [...PENGUINS_META.tags],
    source: PENGUINS_META.source,
    sourceUrl: PENGUINS_META.sourceUrl,
    citation: PENGUINS_META.citation,
    notes: PENGUINS_META.notes,
    variableInfo: [
      { name: 'species', description: 'Penguin species: Adelie, Chinstrap, or Gentoo.' },
      { name: 'island', description: 'Island in the Palmer Archipelago where the penguin was observed.' },
      { name: 'bill_length_mm', description: 'Bill length in millimeters.' },
      { name: 'bill_depth_mm', description: 'Bill depth in millimeters.' },
      { name: 'flipper_length_mm', description: 'Flipper length in millimeters.' },
      { name: 'body_mass_g', description: 'Body mass in grams.' },
      { name: 'sex', description: 'Penguin sex. Some values are missing.' },
      { name: 'year', description: 'Year of observation.' },
    ],
    grid: parsedRowsToGrid([...PENGUINS_HEADERS], PENGUINS_ROWS.map(row => [...row] as unknown[])),
  },
  {
    id: 'sample:old-faithful',
    name: 'Old Faithful Geyser',
    emoji: '🌋',
    description: OLD_FAITHFUL_META.description,
    tags: [...OLD_FAITHFUL_META.tags],
    source: OLD_FAITHFUL_META.source,
    sourceUrl: OLD_FAITHFUL_META.sourceUrl,
    citation: OLD_FAITHFUL_META.citation,
    notes: OLD_FAITHFUL_META.notes,
    variableInfo: [
      { name: 'eruptions', description: 'Duration of the eruption in minutes.' },
      { name: 'waiting', description: 'Waiting time to the next eruption in minutes.' },
    ],
    grid: parsedRowsToGrid([...OLD_FAITHFUL_HEADERS], OLD_FAITHFUL_ROWS.map(row => [...row] as unknown[])),
  },
  {
    id: 'sample:mtcars',
    name: 'Motor Trend Cars',
    emoji: '🚗',
    description: MTCARS_META.description,
    tags: [...MTCARS_META.tags],
    source: MTCARS_META.source,
    sourceUrl: MTCARS_META.sourceUrl,
    citation: MTCARS_META.citation,
    notes: MTCARS_META.notes,
    variableInfo: [
      { name: 'model', description: 'Car model name.' },
      { name: 'mpg', description: 'Miles per gallon.' },
      { name: 'cyl', description: 'Number of cylinders.' },
      { name: 'disp', description: 'Displacement in cubic inches.' },
      { name: 'hp', description: 'Gross horsepower.' },
      { name: 'drat', description: 'Rear axle ratio.' },
      { name: 'wt', description: 'Weight in thousands of pounds.' },
      { name: 'qsec', description: 'Quarter-mile time in seconds.' },
      { name: 'vs', description: 'Engine shape: 0 for V-shaped, 1 for straight.' },
      { name: 'am', description: 'Transmission: 0 for automatic, 1 for manual.' },
      { name: 'gear', description: 'Number of forward gears.' },
      { name: 'carb', description: 'Number of carburetors.' },
    ],
    grid: parsedRowsToGrid([...MTCARS_HEADERS], MTCARS_ROWS.map(row => [...row] as unknown[])),
  },
  {
    id: 'sample:anscombe',
    name: "Anscombe's Quartet",
    emoji: '📉',
    description: 'Four datasets with nearly identical summary statistics but very different scatterplots.',
    tags: ['scatterplot', 'regression', 'outliers', 'visualization'],
    source: "Anscombe's quartet",
    citation: 'Anscombe, F. J. (1973). Graphs in Statistical Analysis.',
    notes: 'Stored in the classic wide layout so each quartet is its own x/y variable pair.',
    variableInfo: [
      { name: 'x1', description: 'x-values for Anscombe dataset I.' },
      { name: 'y1', description: 'y-values for Anscombe dataset I.' },
      { name: 'x2', description: 'x-values for Anscombe dataset II.' },
      { name: 'y2', description: 'y-values for Anscombe dataset II.' },
      { name: 'x3', description: 'x-values for Anscombe dataset III.' },
      { name: 'y3', description: 'y-values for Anscombe dataset III.' },
      { name: 'x4', description: 'x-values for Anscombe dataset IV.' },
      { name: 'y4', description: 'y-values for Anscombe dataset IV.' },
    ],
    grid: parsedRowsToGrid([...ANSCOMBE_HEADERS], ANSCOMBE_ROWS.map(row => [...row])),
  },
]

export function getSampleDatasetId(sample: SampleDataset) {
  return sample.id ?? `sample:${sample.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function getSampleDatasetById(id: string) {
  return SAMPLE_DATASETS.find(sample => getSampleDatasetId(sample) === id)
}
