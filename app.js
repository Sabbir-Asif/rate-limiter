const express = require('express');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

const PORT = 3000;
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.send(`server is running on port: ${PORT}`)
})

app.listen(PORT, () => {
    console.log('Server running on http://localhost:3000');
});
