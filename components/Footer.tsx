export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-5 mt-10">
      <div className="max-w-3xl mx-auto px-4">
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          Data from NYC-SIFT and NYC DOE Open Data. Always verify in the official MySchools portal:{' '}
          <a
            href="https://myschools.nyc"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            myschools.nyc
          </a>
        </p>
      </div>
    </footer>
  )
}
