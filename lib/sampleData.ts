import { parsedRowsToGrid } from './gridHelpers'
import { DatasetVariableInfo, GridState } from '@/types'
import { BIRTH_WEIGHTS_HEADERS, BIRTH_WEIGHTS_META, BIRTH_WEIGHTS_ROWS } from './sampleBirthWeights'
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

const classSurveyHeaders = ['age', 'height_in', 'sleep_hrs', 'subject', 'gpa']
const classSurveyRows = [
  [16, 64, 7, 'Math', 3.8], [17, 70, 6, 'Science', 3.5], [16, 62, 8, 'English', 3.9],
  [18, 68, 5, 'Math', 3.2], [17, 65, 7, 'History', 3.6], [16, 72, 9, 'Science', 4.0],
  [17, 63, 6, 'Math', 3.4], [18, 71, 7, 'English', 3.7], [16, 66, 8, 'Science', 3.8],
  [17, 69, 6, 'History', 3.1], [18, 64, 7, 'Math', 3.5], [16, 67, 8, 'Science', 3.9],
  [17, 73, 6, 'English', 3.3], [18, 65, 9, 'Math', 4.0], [16, 68, 7, 'History', 3.6],
  [17, 70, 6, 'Science', 3.7], [18, 62, 8, 'Math', 3.4], [16, 66, 7, 'English', 3.8],
  [17, 71, 5, 'Science', 3.2], [18, 64, 8, 'History', 3.9], [16, 68, 7, 'Math', 3.5],
  [17, 65, 6, 'English', 3.6], [18, 72, 8, 'Science', 4.0], [16, 69, 7, 'Math', 3.3],
  [17, 63, 9, 'History', 3.7], [18, 67, 6, 'Science', 3.8], [16, 70, 7, 'Math', 3.4],
  [17, 64, 8, 'English', 3.9], [18, 66, 6, 'Science', 3.5], [16, 71, 7, 'History', 3.6],
]

const weatherHeaders = ['city', 'state', 'avg_temp_f', 'rainfall_in', 'snow_days']
const weatherRows = [
  ['Phoenix', 'AZ', 75, 8, 0], ['Miami', 'FL', 77, 62, 0], ['Seattle', 'WA', 52, 38, 6],
  ['Denver', 'CO', 51, 14, 33], ['Chicago', 'IL', 50, 37, 28], ['Houston', 'TX', 68, 49, 1],
  ['New York', 'NY', 55, 47, 22], ['Los Angeles', 'CA', 64, 15, 0], ['Boston', 'MA', 52, 44, 42],
  ['Atlanta', 'GA', 62, 52, 3], ['Minneapolis', 'MN', 45, 29, 45], ['Portland', 'OR', 54, 36, 4],
  ['Las Vegas', 'NV', 70, 4, 0], ['Nashville', 'TN', 60, 48, 5], ['Detroit', 'MI', 49, 33, 38],
  ['San Francisco', 'CA', 57, 24, 0], ['Dallas', 'TX', 66, 35, 2], ['Philadelphia', 'PA', 55, 42, 22],
  ['San Diego', 'CA', 64, 10, 0], ['Salt Lake City', 'UT', 53, 16, 31], ['Kansas City', 'MO', 57, 38, 15],
  ['Charlotte', 'NC', 61, 44, 4], ['Indianapolis', 'IN', 53, 42, 22], ['Columbus', 'OH', 52, 40, 28],
  ['Memphis', 'TN', 63, 53, 3], ['Louisville', 'KY', 57, 46, 12], ['Richmond', 'VA', 58, 44, 9],
  ['Oklahoma City', 'OK', 61, 35, 9], ['Albuquerque', 'NM', 57, 9, 10], ['Raleigh', 'NC', 60, 45, 5],
  ['Omaha', 'NE', 51, 30, 26], ['Tucson', 'AZ', 69, 12, 0], ['Fresno', 'CA', 65, 11, 0],
  ['Sacramento', 'CA', 61, 18, 0], ['Boise', 'ID', 52, 12, 21], ['Spokane', 'WA', 49, 17, 38],
  ['Billings', 'MT', 47, 14, 40], ['Fargo', 'ND', 42, 20, 48], ['Anchorage', 'AK', 36, 16, 75],
  ['Honolulu', 'HI', 77, 17, 0], ['El Paso', 'TX', 65, 9, 3], ['Tulsa', 'OK', 61, 38, 8],
  ['Wichita', 'KS', 57, 28, 16], ['Sioux Falls', 'SD', 46, 25, 36], ['Des Moines', 'IA', 51, 34, 29],
  ['Madison', 'WI', 46, 32, 38], ['Green Bay', 'WI', 44, 28, 42], ['Duluth', 'MN', 39, 31, 67],
  ['Burlington', 'VT', 46, 36, 72], ['Portland', 'ME', 47, 44, 62],
]

const nbaHeaders = ['player', 'team', 'points', 'assists', 'rebounds', 'games']
const nbaRows = [
  ['Joel Embiid', 'PHI', 33.1, 4.2, 10.2, 39], ['Luka Doncic', 'DAL', 32.4, 8.0, 8.6, 66],
  ['Giannis Antetokounmpo', 'MIL', 31.1, 5.7, 11.8, 63], ['Shai Gilgeous-Alexander', 'OKC', 30.1, 6.2, 5.5, 68],
  ['Damian Lillard', 'MIL', 24.3, 7.0, 4.4, 73], ['Kevin Durant', 'PHX', 27.1, 5.0, 6.7, 47],
  ['LeBron James', 'LAL', 25.7, 7.3, 7.3, 71], ['Stephen Curry', 'GSW', 26.4, 4.4, 4.5, 56],
  ['Jayson Tatum', 'BOS', 26.9, 4.9, 8.1, 74], ['Nikola Jokic', 'DEN', 26.4, 9.0, 12.4, 79],
  ['Anthony Edwards', 'MIN', 25.9, 5.1, 5.4, 79], ['Donovan Mitchell', 'CLE', 26.6, 6.1, 5.1, 55],
  ['Tyrese Haliburton', 'IND', 20.1, 10.9, 3.7, 69], ['Devin Booker', 'PHX', 27.1, 6.9, 4.5, 68],
  ['Kawhi Leonard', 'LAC', 23.7, 3.6, 6.1, 68], ['Paul George', 'LAC', 22.6, 3.5, 5.2, 74],
  ['Bam Adebayo', 'MIA', 21.2, 3.3, 10.4, 71], ['De\'Aaron Fox', 'SAC', 25.2, 5.7, 4.4, 78],
  ['Darius Garland', 'CLE', 21.6, 7.8, 3.3, 57], ['Trae Young', 'ATL', 25.7, 10.8, 3.0, 73],
  ['Karl-Anthony Towns', 'MIN', 21.4, 3.4, 8.1, 61], ['Zion Williamson', 'NOP', 22.9, 4.6, 5.8, 29],
  ['Lauri Markkanen', 'UTA', 23.2, 1.9, 8.6, 64], ['Julius Randle', 'NYK', 24.0, 5.0, 9.6, 73],
  ['Jalen Brunson', 'NYK', 28.7, 6.7, 3.6, 77],
]

const olympicHeaders = ['country', 'year', 'gold', 'silver', 'bronze', 'total']
const olympicRows = [
  ['USA', 2020, 39, 41, 33, 113], ['China', 2020, 38, 32, 18, 88], ['GB', 2020, 22, 21, 22, 65],
  ['ROC', 2020, 20, 28, 23, 71], ['Australia', 2020, 17, 7, 22, 46], ['Japan', 2020, 27, 14, 17, 58],
  ['Germany', 2020, 10, 11, 16, 37], ['Netherlands', 2020, 10, 12, 14, 36], ['France', 2020, 10, 12, 11, 33],
  ['Italy', 2020, 10, 10, 20, 40], ['Canada', 2020, 7, 6, 11, 24], ['Brazil', 2020, 7, 6, 8, 21],
  ['New Zealand', 2020, 7, 6, 7, 20], ['Cuba', 2020, 7, 3, 5, 15], ['Hungary', 2020, 6, 7, 7, 20],
  ['South Korea', 2020, 6, 4, 10, 20], ['Poland', 2020, 4, 5, 11, 20], ['Czech Republic', 2020, 4, 4, 3, 11],
  ['Kenya', 2020, 4, 4, 2, 10], ['Norway', 2020, 4, 2, 2, 8], ['Jamaica', 2020, 4, 1, 4, 9],
  ['Spain', 2020, 3, 8, 6, 17], ['Sweden', 2020, 3, 6, 0, 9], ['Switzerland', 2020, 3, 4, 6, 13],
  ['Denmark', 2020, 3, 4, 4, 11], ['Croatia', 2020, 3, 3, 2, 8], ['Iran', 2020, 3, 2, 2, 7],
  ['Serbia', 2020, 3, 1, 5, 9], ['Belgium', 2020, 3, 1, 3, 7], ['Bulgaria', 2020, 3, 1, 2, 6],
  ['Slovakia', 2020, 3, 1, 1, 5], ['Georgia', 2020, 2, 5, 1, 8], ['Greece', 2020, 2, 1, 1, 4],
  ['Ecuador', 2020, 2, 1, 0, 3], ['Ethiopia', 2020, 2, 0, 2, 4], ['Ireland', 2020, 2, 0, 2, 4],
  ['Israel', 2020, 2, 0, 2, 4], ['Qatar', 2020, 2, 0, 1, 3], ['Bahamas', 2020, 2, 0, 0, 2],
  ['Kosovo', 2020, 2, 0, 0, 2],
]

const carHeaders = ['make', 'mpg', 'cylinders', 'horsepower', 'weight_lbs']
const carRows = [
  ['Chevrolet', 18, 8, 307, 3504], ['Buick', 15, 8, 350, 3693], ['Plymouth', 18, 8, 318, 3436],
  ['AMC', 16, 8, 304, 3433], ['Ford', 17, 8, 302, 3449], ['Pontiac', 15, 8, 429, 4341],
  ['Chevrolet', 14, 8, 454, 4354], ['Plymouth', 14, 8, 440, 4312], ['Pontiac', 14, 8, 455, 4425],
  ['AMC', 15, 8, 390, 3850], ['Chevrolet', 29, 4, 97, 1835], ['Toyota', 27, 4, 88, 2130],
  ['Ford', 24, 4, 90, 2672], ['Dodge', 25, 4, 98, 2145], ['VW', 34, 4, 75, 1845],
  ['Honda', 36, 4, 67, 1745], ['Toyota', 31, 4, 97, 2220], ['Datsun', 38, 4, 88, 2075],
  ['VW', 33, 4, 60, 1615], ['BMW', 26, 4, 97, 2230], ['Subaru', 35, 4, 69, 1955],
  ['Datsun', 38, 4, 80, 1985], ['Honda', 32, 4, 80, 1760], ['Mazda', 37, 4, 65, 1975],
  ['Toyota', 33, 4, 65, 1955], ['Ford', 28, 4, 85, 2035], ['AMC', 21, 6, 200, 2875],
  ['Chevrolet', 22, 6, 200, 2587], ['Ford', 21, 6, 200, 2130], ['Pontiac', 20, 6, 155, 2930],
  ['Mercury', 19, 6, 175, 3440], ['Dodge', 21, 6, 225, 3121], ['Ford', 19, 6, 250, 3185],
  ['Buick', 21, 6, 231, 3245], ['Oldsmobile', 19, 8, 260, 3609], ['Pontiac', 18, 8, 318, 3399],
  ['Dodge', 17, 8, 302, 3351], ['Ford', 16, 8, 351, 3399], ['Chevrolet', 16, 8, 350, 3413],
  ['Lincoln', 14, 8, 400, 4341], ['Plymouth', 15, 8, 318, 3952], ['Chrysler', 13, 8, 440, 4735],
  ['Buick', 15, 8, 455, 4951], ['Oldsmobile', 14, 8, 455, 4815], ['Ford', 17, 8, 351, 3664],
  ['Mercury', 16, 8, 400, 4033], ['Chevrolet', 15, 8, 400, 4997], ['Pontiac', 14, 8, 455, 4906],
  ['Chevrolet', 13, 8, 360, 4654], ['Buick', 14, 8, 307, 4654],
]

const studentSurveyHeaders = ['grade', 'gender', 'sport', 'phone_hrs', 'gpa', 'lunch']
const studentSurveyRows = [
  ['9th', 'Female', 'Soccer', 3, 3.8, 'Packed'], ['10th', 'Male', 'Basketball', 4, 3.2, 'School'],
  ['11th', 'Female', 'Swimming', 2, 3.9, 'Packed'], ['12th', 'Male', 'Track', 3, 3.5, 'School'],
  ['9th', 'Male', 'Basketball', 5, 2.9, 'School'], ['10th', 'Female', 'Soccer', 2, 3.7, 'Packed'],
  ['11th', 'Male', 'None', 6, 2.8, 'School'], ['12th', 'Female', 'Swimming', 1, 4.0, 'Packed'],
  ['9th', 'Female', 'Track', 3, 3.6, 'School'], ['10th', 'Male', 'Soccer', 4, 3.1, 'School'],
  ['11th', 'Female', 'Basketball', 2, 3.8, 'Packed'], ['12th', 'Male', 'None', 5, 2.7, 'School'],
  ['9th', 'Male', 'Swimming', 3, 3.4, 'Packed'], ['10th', 'Female', 'Track', 2, 3.9, 'Packed'],
  ['11th', 'Male', 'Basketball', 4, 3.0, 'School'], ['12th', 'Female', 'Soccer', 2, 3.7, 'Packed'],
  ['9th', 'Female', 'None', 4, 3.3, 'School'], ['10th', 'Male', 'Swimming', 3, 3.5, 'Packed'],
  ['11th', 'Female', 'Soccer', 2, 3.8, 'Packed'], ['12th', 'Male', 'Track', 3, 3.2, 'School'],
  ['9th', 'Male', 'None', 6, 2.6, 'School'], ['10th', 'Female', 'Basketball', 3, 3.6, 'Packed'],
  ['11th', 'Male', 'Soccer', 4, 3.1, 'School'], ['12th', 'Female', 'None', 2, 3.9, 'Packed'],
  ['9th', 'Female', 'Swimming', 1, 4.0, 'Packed'], ['10th', 'Male', 'Track', 4, 3.3, 'School'],
  ['11th', 'Female', 'Track', 2, 3.7, 'Packed'], ['12th', 'Male', 'Basketball', 5, 2.9, 'School'],
  ['9th', 'Male', 'Soccer', 3, 3.5, 'School'], ['10th', 'Female', 'None', 3, 3.4, 'Packed'],
  ['11th', 'Male', 'Swimming', 2, 3.8, 'Packed'], ['12th', 'Female', 'Track', 2, 3.9, 'Packed'],
  ['9th', 'Female', 'Basketball', 4, 3.2, 'School'], ['10th', 'Male', 'None', 5, 2.8, 'School'],
  ['11th', 'Female', 'None', 3, 3.6, 'Packed'], ['12th', 'Male', 'Swimming', 2, 3.7, 'School'],
  ['9th', 'Male', 'Track', 3, 3.3, 'Packed'], ['10th', 'Female', 'Swimming', 1, 4.0, 'Packed'],
  ['11th', 'Male', 'Track', 4, 3.1, 'School'], ['12th', 'Female', 'Basketball', 3, 3.5, 'Packed'],
]

export const SAMPLE_DATASETS: SampleDataset[] = [
  { name: 'Class Survey', emoji: '📋', description: 'A small sample of student measurements, sleep, GPA, and favorite subject.', grid: parsedRowsToGrid(classSurveyHeaders, classSurveyRows) },
  { name: 'Student Survey', emoji: '🎓', description: 'Categorical and quantitative survey responses from high school students.', grid: parsedRowsToGrid(studentSurveyHeaders, studentSurveyRows) },
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
    name: 'Birth Weights',
    emoji: '👶',
    description: BIRTH_WEIGHTS_META.description,
    tags: [...BIRTH_WEIGHTS_META.tags],
    source: BIRTH_WEIGHTS_META.source,
    sourceUrl: BIRTH_WEIGHTS_META.sourceUrl,
    citation: BIRTH_WEIGHTS_META.citation,
    notes: BIRTH_WEIGHTS_META.notes,
    variableInfo: [
      { name: 'birth_weight_g', description: 'Infant birth weight in grams.' },
      { name: 'low_birth_weight', description: 'Whether the infant had low birth weight.' },
      { name: 'mother_age', description: 'Mother age in years.' },
      { name: 'mother_weight_lb', description: 'Mother weight in pounds at the last menstrual period.' },
      { name: 'mother_race', description: 'Mother race category as coded in the original study.' },
      { name: 'smoker', description: 'Whether the mother smoked during pregnancy.' },
      { name: 'previous_premature_labors', description: 'Number of previous premature labors.' },
      { name: 'hypertension', description: 'Whether the mother had a history of hypertension.' },
      { name: 'uterine_irritability', description: 'Whether uterine irritability was present.' },
      { name: 'first_trimester_visits', description: 'Number of physician visits during the first trimester.' },
    ],
    grid: parsedRowsToGrid([...BIRTH_WEIGHTS_HEADERS], BIRTH_WEIGHTS_ROWS.map(row => [...row] as unknown[])),
  },
  { name: 'US Weather', emoji: '🌡️', description: 'Average temperature, rainfall, and snowfall patterns for U.S. cities.', grid: parsedRowsToGrid(weatherHeaders, weatherRows) },
  { name: 'NBA Season', emoji: '🏀', description: 'Scoring and performance stats for NBA players.', grid: parsedRowsToGrid(nbaHeaders, nbaRows) },
  { name: 'Olympic Medals', emoji: '🥇', description: 'Country medal counts from the 2020 Olympic Games.', grid: parsedRowsToGrid(olympicHeaders, olympicRows) },
  { name: 'Car Data', emoji: '🚗', description: 'Classic car data with fuel economy, cylinders, horsepower, and weight.', grid: parsedRowsToGrid(carHeaders, carRows) },
]
