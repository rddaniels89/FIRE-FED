# Fed-Fire Development Guidelines

## Project Architecture

### Context Provider Hierarchy
- **MUST** maintain provider order: `AuthProvider` > `ThemeProvider` > `ScenarioProvider` > `Router`
- **NEVER** change the provider nesting order in `src/App.jsx`
- **ALWAYS** use context hooks (`useAuth`, `useTheme`, `useScenario`) instead of direct imports
- **PROHIBITED**: Using context values outside their respective providers

### Component Location Rules
- Place all UI components in `src/components/`
- Place all context providers in `src/contexts/`
- **NEVER** create components in the root `components/` directory
- **ALWAYS** use `src/` as the primary source directory

## Data Flow Standards

### Supabase Integration Patterns
- **ALWAYS** check `isSupabaseAvailable` before Supabase operations
- **MUST** provide localStorage fallback for all Supabase data operations
- **REQUIRED**: Use environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- **NEVER** hard-code Supabase credentials

```javascript
// CORRECT Pattern
if (isSupabaseAvailable && user) {
  // Supabase operation
} else {
  // localStorage fallback
}

// PROHIBITED Pattern  
if (supabase) {
  // Direct supabase usage without availability check
}
```

### Context State Management
- **ALWAYS** update `ScenarioContext` for data persistence
- **MUST** use `updateCurrentScenario()` for scenario modifications
- **REQUIRED**: Debounce Supabase updates with 1000ms timeout
- **NEVER** directly modify scenario state without context methods

### Form Input Patterns
- **ALWAYS** use string state for controlled inputs
- **MUST** convert to numeric values when updating context
- **REQUIRED** pattern: `parseFloat(value) || 0` for numeric conversions

```javascript
// CORRECT Pattern
const handleInputChange = (field, value) => {
  setInputs(prev => ({ ...prev, [field]: value }));
  const numericValue = parseFloat(value) || 0;
  updateCurrentScenario({ [section]: { [field]: numericValue } });
};
```

## Styling Standards

### Tailwind CSS Usage
- **MUST** use custom color palette: `navy`, `gold`, `slate`
- **REQUIRED**: Support dark mode with `dark:` prefixes
- **ALWAYS** use predefined component classes from `src/index.css`:
  - `.btn-primary` for primary buttons
  - `.btn-secondary` for secondary buttons  
  - `.card` for card containers
  - `.input-field` for form inputs
  - `.navy-text` for navy-colored text

### Theme Implementation
- **MUST** use `useTheme()` hook for theme state
- **REQUIRED**: Store theme preference in localStorage as 'theme'
- **ALWAYS** apply dark mode class to `document.documentElement`
- **NEVER** use inline styles for theme-dependent styling

```javascript
// CORRECT Theme Toggle Pattern
const { isDarkMode, toggleTheme } = useTheme();
className={`base-class ${isDarkMode ? 'dark-variant' : 'light-variant'}`}
```

## Navigation and Routing

### Authentication Gating
- **ALWAYS** check `isAuthenticated` before rendering protected routes
- **MUST** show `Auth` component when not authenticated
- **REQUIRED**: Use `loading` state to show loading indicator
- **NEVER** bypass authentication checks

### Navigation Items
- **MUST** maintain navigation items array in `App.jsx`
- **REQUIRED** format: `{ path, label, icon }` with emoji icons
- **ALWAYS** use conditional rendering for authenticated navigation

## Database Integration

### Supabase Schema Patterns
- **ALWAYS** use UUID primary keys with `gen_random_uuid()`
- **MUST** include `user_id` foreign key to `auth.users(id)`
- **REQUIRED**: Enable Row Level Security (RLS) on all user tables
- **ALWAYS** use JSONB for complex data structures

### RLS Policy Standards
```sql
-- REQUIRED Policy Pattern
CREATE POLICY "Users can view their own data" ON table_name
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data" ON table_name  
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data" ON table_name
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own data" ON table_name
  FOR DELETE USING (auth.uid() = user_id);
```

### Data Structure Consistency
- **MUST** use JSONB columns for: `tsp_data`, `fers_data`, `fire_goal`
- **REQUIRED**: Match scenario object structure from `ScenarioContext`
- **ALWAYS** provide default values in `createDefaultScenario()`

## Environment Configuration

### Environment Variables
- **REQUIRED**: Use `.env` file for Supabase configuration
- **MUST** check for placeholder values before initialization
- **NEVER** commit real credentials to version control

```javascript
// CORRECT Environment Check
if (supabaseUrl && supabaseAnonKey && 
    supabaseUrl !== 'your_supabase_project_url' && 
    supabaseAnonKey !== 'your_supabase_anon_key') {
  // Initialize Supabase
}
```

## Multi-File Coordination Requirements

### When Modifying Contexts
- **AuthContext changes**: Update `App.jsx` navigation logic
- **ScenarioContext changes**: Update all calculator components
- **ThemeContext changes**: Update `App.jsx` theme toggle and CSS classes

### When Adding New Features
- **MUST** update navigation items in `App.jsx`
- **REQUIRED**: Add corresponding route in `Routes` section
- **ALWAYS** implement authentication gating for new pages

### When Modifying Data Structures
- **MUST** update `createDefaultScenario()` in `ScenarioContext`
- **REQUIRED**: Update Supabase schema if adding database fields
- **ALWAYS** maintain backward compatibility with existing scenarios

## AI Decision-Making Standards

### Feature Addition Priority
1. Check authentication requirements first
2. Determine if Supabase integration needed
3. Identify affected contexts and components
4. Plan multi-file coordination

### Error Handling Hierarchy
1. Supabase errors → localStorage fallback
2. Context errors → Default values
3. Form validation → User feedback
4. Network errors → Graceful degradation

### Component Development Order
1. Create component in `src/components/`
2. Implement context integration
3. Add navigation route
4. Update authentication gating
5. Implement styling with custom classes

## Prohibited Actions

### Code Structure Violations
- **NEVER** create components outside `src/components/`
- **NEVER** bypass context providers for state management
- **NEVER** use direct DOM manipulation for theme changes
- **NEVER** hardcode environment values

### Data Flow Violations  
- **NEVER** update scenarios without using context methods
- **NEVER** skip localStorage fallback for Supabase operations
- **NEVER** modify user data without proper authentication checks

### Styling Violations
- **NEVER** use CSS-in-JS for theme-dependent styles
- **NEVER** create custom colors outside the defined palette
- **NEVER** implement dark mode without localStorage persistence

### Security Violations
- **NEVER** bypass RLS policies in database queries
- **NEVER** expose sensitive environment variables
- **NEVER** allow unauthenticated access to user data

## Federal Retirement Domain Rules

### FERS Pension Calculations
- **ALWAYS** use high-3 salary average for pension calculations
- **MUST** account for years and months of service separately
- **REQUIRED**: Validate retirement age eligibility rules

### TSP (Thrift Savings Plan)
- **MUST** support G, F, C, S, I fund allocations totaling 100%
- **REQUIRED**: Handle Traditional vs Roth contribution types
- **ALWAYS** use compound interest calculations for projections

### FIRE Gap Analysis
- **MUST** calculate gap between FERS/TSP and FIRE income goals
- **REQUIRED**: Account for spouse income and side hustles
- **ALWAYS** provide actionable recommendations for bridging gaps

