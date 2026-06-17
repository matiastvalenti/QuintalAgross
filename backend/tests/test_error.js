fetch("http://localhost:8000/commissions/test_error")
  .then((r) => r.text())
  .then((t) => console.log(t))
  .catch((e) => console.log(e));
