import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ResultsPage from './pages/ResultsPage'
import SavedPage from './pages/SavedPage'
import NetworkPage from './pages/NetworkPage'
import AuthPage from './pages/AuthPage'
import AlertsPage from './pages/AlertsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="sign-in" element={<AuthPage key="sign-in" mode="sign-in" />} />
          <Route path="sign-up" element={<AuthPage key="sign-up" mode="sign-up" />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
