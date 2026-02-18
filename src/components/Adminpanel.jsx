import React, { useState, useEffect } from 'react';
import { db } from '../Firebase/config';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  doc, deleteDoc, updateDoc, writeBatch, getDocs, where 
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import '../components/Adminpanel.css';

const AdminPanel = () => {
    const [categorias, setCategorias] = useState([]);
    const [productos, setProductos] = useState([]);
    const [categoriaActiva, setCategoriaActiva] = useState(null);
    // 1. Definir clave y estados
const CLAVE_CORRECTA = import.meta.env.VITE_ADMIN_PASSWORD;
const [autorizado, setAutorizado] = useState(false);
const [password, setPassword] = useState('');
const [error, setError] = useState(false);

// 2. Función de validación
const verificarClave = (e) => {
    e.preventDefault();
    
    if (password === CLAVE_CORRECTA) {
        setAutorizado(true);
        setError(false);
    } else {
        setError(true); // Mostramos el mensaje de "Contraseña incorrecta"
        setPassword(''); // Limpiamos el input
    }
};
    // --- SUSCRIPCIÓN A DATOS ---
    useEffect(() => {
        const qCat = query(collection(db, "categorias"), orderBy("nombre", "asc"));
        const unsubscribeCat = onSnapshot(qCat, (snap) => {
            const cats = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setCategorias(cats);
            // Si hay categorías y ninguna está activa, seleccionamos la primera
            if (cats.length > 0 && !categoriaActiva) {
                setCategoriaActiva(cats[0].id);
            }
        });

        const unsubscribeProd = onSnapshot(collection(db, "productos"), (snap) => {
            setProductos(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        });

        return () => { unsubscribeCat(); unsubscribeProd(); };
    }, [categoriaActiva]);

    // --- LÓGICA DE CATEGORÍAS ---
    const crearCategoria = async () => {
        const { value: nombre } = await Swal.fire({
            title: 'Nueva Categoría',
            input: 'text',
            inputPlaceholder: 'Nombre de la categoría...',
            confirmButtonColor: '#398F82',
            showCancelButton: true
        });

        if (nombre && nombre.trim()) {
            const docRef = await addDoc(collection(db, "categorias"), { nombre: nombre.trim() });
            setCategoriaActiva(docRef.id);
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Categoría creada', showConfirmButton: false, timer: 2000 });
        }
    };

    const editarCategoria = async (catId, viejoNombre) => {
        const { value: nuevoNombre } = await Swal.fire({
            title: 'Editar Categoría',
            input: 'text',
            inputValue: viejoNombre,
            confirmButtonColor: '#398F82',
            showCancelButton: true,
            inputValidator: (value) => !value && '¡El nombre es obligatorio!'
        });

        if (nuevoNombre && nuevoNombre.trim() !== viejoNombre) {
            try {
                const batch = writeBatch(db);
                const q = query(collection(db, "productos"), where("categoria", "==", viejoNombre));
                const prodsSnap = await getDocs(q);
                prodsSnap.forEach((d) => batch.update(d.ref, { categoria: nuevoNombre.trim() }));
                batch.update(doc(db, "categorias", catId), { nombre: nuevoNombre.trim() });
                await batch.commit();
                Swal.fire('Actualizado', 'Categoría y productos actualizados', 'success');
            } catch (e) { console.error(e); }
        }
    };

    const eliminarCategoria = async (catId, catNombre) => {
        const result = await Swal.fire({
            title: '¿Eliminar categoría?',
            text: `Se borrará "${catNombre}" y TODOS sus platos asociados.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar todo'
        });

        if (result.isConfirmed) {
            try {
                const batch = writeBatch(db);
                const q = query(collection(db, "productos"), where("categoria", "==", catNombre));
                const prodsSnap = await getDocs(q);
                prodsSnap.forEach((d) => batch.delete(d.ref));
                batch.delete(doc(db, "categorias", catId));
                await batch.commit();
                setCategoriaActiva(null);
                Swal.fire('Borrado', 'Categoría eliminada', 'success');
            } catch (e) { console.error(e); }
        }
    };

    // --- LÓGICA DE PRODUCTOS ---
    const abrirModalProducto = async (prod = null, nombreCategoria = null) => {
        const esEdicion = !!prod;
        const { value: formValues } = await Swal.fire({
            title: esEdicion ? 'Editar Plato' : `Nuevo en ${nombreCategoria}`,
            confirmButtonColor: '#398F82',
            showCancelButton: true,
            html:
                `<input id="swal-name" class="swal2-input" placeholder="Nombre" value="${esEdicion ? prod.nombre : ''}">` +
                `<input id="swal-price" type="number" class="swal2-input" placeholder="Precio" value="${esEdicion ? prod.precio : ''}">` +
                `<textarea id="swal-desc" class="swal2-textarea" placeholder="Descripción" style="height:80px">${esEdicion ? (prod.descripcion || '') : ''}</textarea>` +
                `<input id="swal-file" type="file" class="swal2-file" accept="image/*">`,
            preConfirm: () => {
                const nombre = document.getElementById('swal-name').value;
                const precio = document.getElementById('swal-price').value;
                if (!nombre || !precio) return Swal.showValidationMessage('Nombre y Precio obligatorios');
                return { 
                    nombre, 
                    precio, 
                    descripcion: document.getElementById('swal-desc').value, 
                    archivo: document.getElementById('swal-file').files[0] 
                };
            }
        });

        if (formValues) guardarProducto(formValues, prod, nombreCategoria);
    };

    const guardarProducto = async (valores, prodExistente, nombreCategoria) => {
        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            let urlImagenFinal = prodExistente ? prodExistente.imagen : '';
            if (valores.archivo) {
                const formData = new FormData();
                formData.append('file', valores.archivo);
                formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
                const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                urlImagenFinal = data.secure_url;
            }

            const datos = {
                nombre: valores.nombre,
                precio: parseFloat(valores.precio),
                descripcion: valores.descripcion,
                imagen: urlImagenFinal,
                categoria: prodExistente ? prodExistente.categoria : nombreCategoria
            };

            if (prodExistente) await updateDoc(doc(db, "productos", prodExistente.id), datos);
            else await addDoc(collection(db, "productos"), datos);

            Swal.fire('¡Éxito!', 'Plato guardado', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo guardar', 'error'); }
    };

    const eliminarProducto = async (id) => {
        const res = await Swal.fire({ title: '¿Eliminar plato?', icon: 'question', showCancelButton: true, confirmButtonColor: '#d33' });
        if (res.isConfirmed) {
            await deleteDoc(doc(db, "productos", id));
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Eliminado', showConfirmButton: false, timer: 1500 });
        }
    };

    // Filtramos los datos de la categoría seleccionada
    const catActual = categorias.find(c => c.id === categoriaActiva);
if (!autorizado) {
    return (
        <div className="login-screen">
            <form className="login-card" onSubmit={verificarClave}>
                <img src="/vite.jpeg" alt="Logo" className="header-logo-img" />
                <h2>Panel de Administración</h2>
                
                <input 
                    type="password" 
                    className="login-input-style" 
                    placeholder="Introduce la clave" 
                    value={password} 
                    onChange={(e) => {
                        setPassword(e.target.value);
                        if(error) setError(false); // Oculta el error mientras el usuario escribe
                    }} 
                />
                
                <button type="submit" className="btn-login">
                    Entrar
                </button>

                {/* MENSAJE DE ERROR CONDICIONAL */}
                {error && (
                    <p style={{ 
                        color: '#ff4d4d', 
                        fontSize: '14px', 
                        marginTop: '10px',
                        fontWeight: 'bold',
                        textAlign: 'center' 
                    }}>
                        ❌ Contraseña incorrecta. Inténtalo de nuevo.
                    </p>
                )}
            </form>
        </div>
    );
}
    return (
        <div className="admin-container">
            <div className="admin-header-logo">
                <img src="/vite.jpeg" alt="Logo" className="header-logo-img" />
            </div>
            
            {/* BARRA DE NAVEGACIÓN DESLIZABLE */}
            <div className="categories-nav-wrapper">
                <div className="categories-nav">
                    {categorias.map(cat => (
                        <div 
                            key={cat.id} 
                            className={`cat-tab ${categoriaActiva === cat.id ? 'active' : ''}`}
                            onClick={() => setCategoriaActiva(cat.id)}
                        >
                            {cat.nombre}
                        </div>
                    ))}
                </div>
                <button className="btn-new-cat-inline" onClick={crearCategoria}>+</button>
            </div>

            {/* MOSTRAR CONTENIDO DE LA CATEGORÍA SELECCIONADA */}
            {catActual ? (
                <div className="admin-cat-card">
                    <div className="admin-cat-header">
                        <div className="cat-title-block">
                            <h2>{catActual.nombre}</h2>
                            <button className="btn-edit" onClick={() => editarCategoria(catActual.id, catActual.nombre)}>✎</button>
                            <button className="btn-delete" onClick={() => eliminarCategoria(catActual.id, catActual.nombre)}>✕</button>
                        </div>
                        <button className="btn-add" onClick={() => abrirModalProducto(null, catActual.nombre)}>
                            + AGREGAR PLATO
                        </button>
                    </div>

                    <div className="admin-prod-list">
                        {productos.filter(p => p.categoria === catActual.nombre).map(p => (
                            <div key={p.id} className="admin-prod-row">
                                <div className="prod-info-left">
                                    <span className="p-name">{p.nombre}</span>
                                    <span className="p-price">${p.precio}</span>
                                    <p className="p-desc">{p.descripcion || "Sin descripción."}</p>
                                </div>
                                <div className="prod-img-center">
                                    <img src={p.imagen || 'https://via.placeholder.com/150'} alt={p.nombre} className="p-img" />
                                </div>
                                <div className="prod-btns-right">
                                    <button className="btn-edit1" onClick={() => abrirModalProducto(p)}>✎</button>
                                    <button className="btn-delete1" onClick={() => eliminarProducto(p.id)}>✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <p style={{color: 'white', textAlign: 'center'}}>Crea una categoría para empezar</p>
            )}
        </div>
    );
};

export default AdminPanel;