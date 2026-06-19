const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const ExcelJS=require('exceljs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "public/uploads");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });
const app = express();


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use(express.static('public'));

app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'node_auth'
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));

app.post('/register', upload.single('image'), (req, res) => {
    const { username, email, password } = req.body;
    const image = req.file ? req.file.filename : 'default.jpg';
    const sql = "INSERT INTO users (username, email, password, profile_image) VALUES (?, ?, ?, ?)";
    db.query(sql, [username, email, password, image], (err, result) => {
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
    db.query(sql, [email, password], (err, results) => {
        if (err) return res.send("Database Error");
        if (results.length > 0) {
            req.session.isLoggedIn = true;
            req.session.username = results[0].username; 
            res.redirect('/dashboard/main');
        } else {
            res.send("Email သို့မဟုတ် Password မှားနေပါသည်။");
        }
    });
});


app.get('/dashboard/main', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'dashboard', 'main.html'));
});

app.get('/dashboard/setting', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'dashboard', 'setting.html'));
});

app.get('/dashboard/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send("Error logging out");
        }
        res.redirect('/login'); 
    });
});

app.get('/api/get-user-count', (req, res) => {
    db.query("SELECT COUNT(*) AS total FROM users", (err, results) => {
        res.json({ count: results[0].total });
    });
});

app.get('/api/get-username', (req, res) => {
    res.json({ username: req.session.username || "Admin" });
});


app.get('/api/get-user-data', (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const sql = "SELECT * FROM users WHERE username = ?";
    db.query(sql, [req.session.username], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ error: "User not found" });
        res.json(results[0]);
    });
});


app.get('/welcome', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    db.query('SELECT * FROM users', (err, allUsers) => {
        res.render('welcome', { userList: allUsers });
    });
});

app.post('/add-user', upload.single('image'), (req, res) => {
    const { username, email, password } = req.body;
    const image = req.file ? req.file.filename : 'default.jpg';
    db.query("INSERT INTO users (username, email, password, profile_image) VALUES (?, ?, ?, ?)", [username, email, password, image], () => {
        res.redirect('/welcome');
    });
});
app.post('/update-profile', upload.single('image'), (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const { email, password } = req.body;
    const username = req.session.username;

    if (req.file) {
        db.query("UPDATE users SET email=?, password=?, profile_image=? WHERE username=?", [email, password, req.file.filename, username], () => res.redirect('/dashboard/settings'));
    } else {
        db.query("UPDATE users SET email=?, password=? WHERE username=?", [email, password, username], () => res.redirect('/dashboard/settings'));
    }
});

app.get('/delete-user/:id', (req, res) => {
    db.query("DELETE FROM users WHERE id = ?", [req.params.id], () => res.redirect('/welcome'));
});

app.get('/dashboard/backup', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'dashboard', 'backup.html'));
});

app.get('/dashboard/shopinfo', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'dashboard', 'shopinfo.html'));
});


app.get('/api/get-shop-info', (req, res) => {
    const query = "SELECT * FROM shop_settings WHERE id = 1";
    db.query(query, (err, result) => {
        if (err) return res.status(500).json({ error: "Data error" });
       
        res.json(result.length > 0 ? result[0] : {}); 
    });
});

app.post('/api/update-shop-info', upload.single('logo'), (req, res) => {
    const { name, phone, email, address, printer, thank_msg, type } = req.body;
    let logoPath = req.file ? req.file.filename : null;

  
    let query = "UPDATE shop_settings SET clinic_name=?, phone=?, email=?, address=?, printer_type=?, thank_msg=?, clinic_type=?";
    let params = [name, phone, email, address, printer, thank_msg, type];

    if (logoPath) {
        query += ", logo_path=?";
        params.push(logoPath);
    }
    query += " WHERE id=1";

    db.query(query, params, (err, result) => {
        if (err) {
            console.error(err);
            return res.send("Error updating settings");
        }
        res.redirect('/dashboard/shopinfo'); 
    });
});

//Export Excel..............................

app.get('/api/export-users',(req,res)=>{

    const query="SELECT * FROM users";
    db.query(query,async(err,results)=>{
        if(err) return res.status(500).send("Error");

        console.log("Database Result", results[0]);

        const workbook=new ExcelJS.Workbook();
        const worksheet=workbook.addWorksheet('Userlist');

        worksheet.columns=[
            {header: 'ID', key:'id', width:10},
            {header: 'Name', key:'username', width:25},
            {header: 'Email', key:'email', width:50},
            {header: 'Password', key:'password', width:50}

        ];

        worksheet.addRows(results);

        worksheet.getRow(1).font={bold: true};
        worksheet.getRow(1).fill={
            type:'pattern',
            pattern:'solid',
            fgColor:{argb:'FFD3D3D3'}
        };

        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attechment; filename=Users.xlsx');

        await workbook.xlsx.write(res);
        res.send();

    });

});

//Products..............................

app.get('/dashboard/product', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'product.html'));
});


app.post('/api/add-product', upload.single('image'), (req, res) => {
    const { name, category, brand, unit, price } = req.body;
    const image = req.file ? req.file.filename : null;

    const sql = "INSERT INTO products (name, category, brand, unit, price, image) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(sql, [name, category, brand, unit, price, image], (err, result) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).send("Error adding product");
        }
        res.send("Success");
    });
});


app.get('/api/products', (req, res) => {
    db.query("SELECT * FROM products", (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

//Edit Product...............................

app.post('/api/update-product/:id', upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { name, category, brand, unit, price } = req.body;
    const image = req.file ? req.file.filename : null;

    let sql = "";
    let params = [];

    if (image) {
       
        sql = "UPDATE products SET name=?, category=?, brand=?, unit=?, price=?, image=? WHERE id=?";
        params = [name, category, brand, unit, price, image, id];
    } else {
       
        sql = "UPDATE products SET name=?, category=?, brand=?, unit=?, price=? WHERE id=?";
        params = [name, category, brand, unit, price, id];
    }

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error("Update Error:", err);
            return res.status(500).send("Update Failed");
        }
        res.send("Updated Successfully");
    });
});

// Delete Product....................
app.delete('/api/delete-product/:id', (req, res) => {
    const id = req.params.id;
    db.query("DELETE FROM products WHERE id = ?", [id], (err, result) => {
        if (err) {
            console.error("Delete Error:", err);
            return res.status(500).send("Delete Failed");
        }
        res.send("Deleted Successfully");
    });
});

app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});