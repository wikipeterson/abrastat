import { parsedRowsToGrid } from './gridHelpers'
import { DatasetVariableInfo, GridState } from '@/types'
import { IRIS_HEADERS, IRIS_META, IRIS_ROWS } from './sampleIris'
import { PENGUINS_HEADERS, PENGUINS_META, PENGUINS_ROWS } from './samplePenguins'
import { TITANIC_STUDENT_HEADERS, TITANIC_STUDENT_META, TITANIC_STUDENT_ROWS } from './sampleTitanic'

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
]

export function getSampleDatasetId(sample: SampleDataset) {
  return sample.id ?? `sample:${sample.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function getSampleDatasetById(id: string) {
  return SAMPLE_DATASETS.find(sample => getSampleDatasetId(sample) === id)
}
