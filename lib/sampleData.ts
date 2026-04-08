import { parsedRowsToGrid } from './gridHelpers'
import { DatasetVariableInfo, GridState } from '@/types'
import { IRIS_HEADERS, IRIS_META, IRIS_ROWS } from './sampleIris'
import { PENGUINS_HEADERS, PENGUINS_META, PENGUINS_ROWS } from './samplePenguins'
import { TITANIC_STUDENT_HEADERS, TITANIC_STUDENT_META, TITANIC_STUDENT_ROWS } from './sampleTitanic'

const ANSCOMBE_HEADERS = ['x', 'y', 'quartet']
const ANSCOMBE_ROWS: unknown[][] = [
  [10, 8.04, 'I'],
  [8, 6.95, 'I'],
  [13, 7.58, 'I'],
  [9, 8.81, 'I'],
  [11, 8.33, 'I'],
  [14, 9.96, 'I'],
  [6, 7.24, 'I'],
  [4, 4.26, 'I'],
  [12, 10.84, 'I'],
  [7, 4.82, 'I'],
  [5, 5.68, 'I'],
  [10, 9.14, 'II'],
  [8, 8.14, 'II'],
  [13, 8.74, 'II'],
  [9, 8.77, 'II'],
  [11, 9.26, 'II'],
  [14, 8.10, 'II'],
  [6, 6.13, 'II'],
  [4, 3.10, 'II'],
  [12, 9.13, 'II'],
  [7, 7.26, 'II'],
  [5, 4.74, 'II'],
  [10, 7.46, 'III'],
  [8, 6.77, 'III'],
  [13, 12.74, 'III'],
  [9, 7.11, 'III'],
  [11, 7.81, 'III'],
  [14, 8.84, 'III'],
  [6, 6.08, 'III'],
  [4, 5.39, 'III'],
  [12, 8.15, 'III'],
  [7, 6.42, 'III'],
  [5, 5.73, 'III'],
  [8, 6.58, 'IV'],
  [8, 5.76, 'IV'],
  [8, 7.71, 'IV'],
  [8, 8.84, 'IV'],
  [8, 8.47, 'IV'],
  [8, 7.04, 'IV'],
  [8, 5.25, 'IV'],
  [19, 12.50, 'IV'],
  [8, 5.56, 'IV'],
  [8, 7.91, 'IV'],
  [8, 6.89, 'IV'],
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
    id: 'sample:anscombe',
    name: "Anscombe's Quartet",
    emoji: '📉',
    description: 'Four datasets with nearly identical summary statistics but very different scatterplots.',
    tags: ['scatterplot', 'regression', 'outliers', 'visualization'],
    source: "Anscombe's quartet",
    citation: 'Anscombe, F. J. (1973). Graphs in Statistical Analysis.',
    notes: 'Use the quartet variable to compare the four classic datasets side by side.',
    variableInfo: [
      { name: 'x', description: 'Explanatory variable value.' },
      { name: 'y', description: 'Response variable value.' },
      { name: 'quartet', description: 'Which of the four Anscombe datasets the row belongs to: I, II, III, or IV.' },
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
