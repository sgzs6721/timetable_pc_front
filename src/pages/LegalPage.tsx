import { Link, useParams } from 'react-router-dom'
import legal from '../content/legal.json'

interface LegalBlock {
  kind: string
  text: string
}

const documents: Record<string, LegalBlock[]> = {
  agreement: legal.agreement,
  privacy: legal.privacy,
}

export function LegalPage() {
  const { doc = 'agreement' } = useParams()
  const blocks = documents[doc] || documents.agreement

  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link className="legal-back" to="/login">返回登录</Link>
        {blocks.map((block, index) => {
          if (block.kind === 'legal-kicker') {
            return <p key={index} className="legal-kicker">{block.text}</p>
          }
          if (block.kind === 'legal-title') {
            return <h1 key={index}>{block.text}</h1>
          }
          if (block.kind === 'legal-meta' || block.kind === 'legal-summary') {
            return <p key={index} className="legal-lead">{block.text}</p>
          }
          if (block.kind === 'section-title') {
            return <h2 key={index}>{block.text}</h2>
          }
          return <p key={index}>{block.text}</p>
        })}
      </article>
    </main>
  )
}
