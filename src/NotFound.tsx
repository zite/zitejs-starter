const NotFound = () => (
  <div className="flex h-screen w-full flex-col items-center justify-center bg-[#F9F9F9] px-6 text-center text-[#211C20]">
    <div className="max-w-md flex flex-col items-center">
      <div className="mb-6 flex items-center justify-center rounded-full bg-[#FFC738]/20 p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#071003"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-wrench"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
      <h1 className="text-3xl font-semibold">Page not implemented</h1>
      <p className="mt-2 text-[#666]">
        This page is under construction or hasn't been added yet.
      </p>
      <div className="mt-6">
        <a
          href="/"
          className="inline-block rounded-md bg-[#FFC738] px-4 py-2 text-sm font-medium text-black hover:opacity-90 transition"
        >
          Go back home
        </a>
      </div>
    </div>
  </div>
);

export default NotFound;
