import { useState, useRef } from 'react'
import { ALL_CATEGORIES } from '../../constants/categories'
import { restaurantManagerApi } from '../../api/restaurantManagerApi'
import { logger } from '../../utils/logger'
import { getUserMessage } from '../../utils/errorHandler'

export function MenuImportWizard({ restaurantName, onBulkAdd, onClose }) {
  const [step, setStep] = useState(1)
  const [menuText, setMenuText] = useState('')
  const [parsedDishes, setParsedDishes] = useState([])
  const [selected, setSelected] = useState({})
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const [extractingPdf, setExtractingPdf] = useState(false)

  async function handlePdfUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file'); return }
    setExtractingPdf(true)
    setError(null)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map(item => item.str).join(' ')
        fullText += pageText + '\n'
      }
      setMenuText(fullText.trim())
    } catch (err) {
      logger.error('PDF extraction error:', err)
      setError('Could not extract text from PDF. Try pasting the menu text instead.')
    } finally {
      setExtractingPdf(false)
    }
  }

  async function handleParse() {
    if (!menuText.trim()) return
    setStep(2)
    setError(null)
    try {
      const dishes = await restaurantManagerApi.parseMenuText(menuText, restaurantName)
      if (!dishes.length) { setError('No dishes found. Try pasting more of the menu.'); setStep(1); return }
      setParsedDishes(dishes)
      const sel = {}
      dishes.forEach((_, i) => { sel[i] = true })
      setSelected(sel)
      setStep(3)
    } catch (err) {
      logger.error('Menu parse error:', err)
      setError(`Parse failed: ${getUserMessage(err, 'parsing menu')}`)
      setStep(1)
    }
  }

  function toggleDish(index) { setSelected(prev => ({ ...prev, [index]: !prev[index] })) }
  function selectAll() { const sel = {}; parsedDishes.forEach((_, i) => { sel[i] = true }); setSelected(sel) }
  function deselectAll() { setSelected({}) }
  function updateDish(index, field, value) {
    setParsedDishes(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d))
  }

  function handleConfirm() {
    const toAdd = parsedDishes.filter((_, i) => selected[i])
    if (!toAdd.length) return
    onBulkAdd(toAdd)
    onClose()
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  if (step === 1) {
    return (
      <div className="p-4 rounded-xl border mb-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-divider)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Import Menu</h3>
          <button onClick={onClose} className="text-xs font-medium px-2 py-1 rounded" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
        </div>
        <textarea
          value={menuText}
          onChange={(e) => setMenuText(e.target.value)}
          placeholder="Paste your menu here — dish names, prices, sections, whatever you have..."
          rows={8}
          className="w-full px-3 py-2 border rounded-lg text-sm resize-y"
          style={{ borderColor: 'var(--color-divider)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleParse}
            disabled={!menuText.trim()}
            className="flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Parse Menu
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={extractingPdf}
            className="px-4 py-2.5 rounded-lg font-medium text-sm border"
            style={{ borderColor: 'var(--color-divider)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-elevated)' }}
          >
            {extractingPdf ? 'Reading PDF...' : 'Upload PDF'}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
        </div>
        {error && <p className="text-xs mt-2 font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="p-4 rounded-xl border mb-4 text-center" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-divider)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: 'var(--color-primary)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Parsing your menu...</p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>This takes a few seconds</p>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-xl border mb-4" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-divider)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Review Dishes ({parsedDishes.length} found)</h3>
        <button onClick={onClose} className="text-xs font-medium px-2 py-1 rounded" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={selectAll} className="text-xs font-medium px-2 py-1 rounded" style={{ color: 'var(--color-primary)' }}>Select All</button>
        <button onClick={deselectAll} className="text-xs font-medium px-2 py-1 rounded" style={{ color: 'var(--color-text-tertiary)' }}>Deselect All</button>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {parsedDishes.map((dish, i) => (
          <div
            key={i}
            className="flex items-center gap-2 p-2 rounded-lg border"
            style={{
              borderColor: selected[i] ? 'var(--color-primary)' : 'var(--color-divider)',
              background: selected[i] ? 'rgba(var(--color-primary-rgb), 0.05)' : 'var(--color-surface)',
            }}
          >
            <input type="checkbox" checked={!!selected[i]} onChange={() => toggleDish(i)} className="shrink-0" />
            <input
              type="text" value={dish.name} onChange={(e) => updateDish(i, 'name', e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 border rounded text-sm"
              style={{ borderColor: 'var(--color-divider)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
            />
            <select
              value={dish.category} onChange={(e) => updateDish(i, 'category', e.target.value)}
              className="px-1 py-1 border rounded text-xs shrink-0"
              style={{ borderColor: 'var(--color-divider)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)', maxWidth: '100px' }}
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
              ))}
            </select>
            <input
              type="number" value={dish.price || ''} onChange={(e) => updateDish(i, 'price', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="$" step="0.01" min="0"
              className="w-16 px-2 py-1 border rounded text-sm text-right shrink-0"
              style={{ borderColor: 'var(--color-divider)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleConfirm} disabled={selectedCount === 0}
          className="flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
        >
          Add {selectedCount} to Menu
        </button>
        <button
          onClick={() => { setStep(1); setError(null) }}
          className="px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)', background: 'var(--color-surface-elevated)' }}
        >
          Back
        </button>
      </div>
    </div>
  )
}
